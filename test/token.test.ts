import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEY_INSTALLATION, KEY_TOKEN, idbDel, idbGet, idbSet } from '../src/idb'
import { init, resetForTests } from '../src/state'
import { deleteToken, getToken } from '../src/token'

const BASE = 'https://links.example.com'
const VAPID_BYTES = new Uint8Array(65).map((_, i) => i + 1)
function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const VAPID_B64 = b64url(VAPID_BYTES)

interface FakeSubscription {
  options: { applicationServerKey: BufferSource | null }
  unsubscribe: ReturnType<typeof vi.fn>
  toJSON(): { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
}

function fakeSubscription(key: BufferSource | null, endpoint = 'https://gateway.example/ep'): FakeSubscription {
  return {
    options: { applicationServerKey: key },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'P256', auth: 'AUTH' } }),
  }
}

function fakeRegistration(existing: FakeSubscription | null) {
  const subscribe = vi.fn(async (options: { applicationServerKey: BufferSource }) =>
    fakeSubscription(options.applicationServerKey),
  )
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe,
    },
  }
}

function stubEnvironment(registration: ReturnType<typeof fakeRegistration>, permission = 'granted') {
  const register = vi.fn().mockResolvedValue(registration)
  vi.stubGlobal('navigator', {
    serviceWorker: {
      register,
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  })
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  })
  const fetchMock = vi.fn(async (url: string, initArg?: RequestInit) => {
    if (url.endsWith('/vapid-public-key')) {
      return new Response(JSON.stringify({ public_key: VAPID_B64 }), { status: 200 })
    }
    if (url.endsWith('/subscribe')) {
      const body = JSON.parse(initArg?.body as string) as { installation_id: string }
      return new Response(JSON.stringify({ token: `${body.installation_id}:cred` }), { status: 200 })
    }
    if (url.endsWith('/unsubscribe')) {
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  return { register, fetchMock }
}

function subscribeBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => (url as string).endsWith('/subscribe'))
  expect(call).toBeDefined()
  return JSON.parse((call![1] as RequestInit).body as string) as Record<string, unknown>
}

beforeEach(async () => {
  resetForTests()
  init({ baseUrl: BASE, project: 'website' })
  await idbDel(KEY_INSTALLATION)
  await idbDel(KEY_TOKEN)
})

afterEach(() => vi.unstubAllGlobals())

describe('getToken', () => {
  it('registers the SW, subscribes, posts the registration, and caches the token', async () => {
    const registration = fakeRegistration(null)
    const { register, fetchMock } = stubEnvironment(registration)

    const token = await getToken()

    expect(register).toHaveBeenCalledWith('/moonsender-sw.js')
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    )
    const body = subscribeBody(fetchMock)
    expect(body.endpoint).toBe('https://gateway.example/ep')
    expect(body.keys).toEqual({ p256dh: 'P256', auth: 'AUTH' })
    expect(typeof body.installation_id).toBe('string')
    expect((body.installation_id as string).length).toBeGreaterThanOrEqual(10)
    expect(token).toBe(`${body.installation_id as string}:cred`)
    expect(await idbGet(KEY_TOKEN)).toBe(token)
  })

  it('reuses the minted installation id across calls', async () => {
    const { fetchMock } = stubEnvironment(fakeRegistration(null))
    await getToken()
    const first = subscribeBody(fetchMock).installation_id

    vi.unstubAllGlobals()
    const { fetchMock: secondFetch } = stubEnvironment(fakeRegistration(null))
    await getToken()
    expect(subscribeBody(secondFetch).installation_id).toBe(first)
  })

  it('reuses an existing subscription whose key matches', async () => {
    const registration = fakeRegistration(fakeSubscription(VAPID_BYTES.slice().buffer))
    stubEnvironment(registration)

    await getToken()
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('resubscribes when the server key rotated', async () => {
    const stale = fakeSubscription(new Uint8Array([9, 9, 9]).buffer)
    const registration = fakeRegistration(stale)
    stubEnvironment(registration)

    await getToken()
    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(registration.pushManager.subscribe).toHaveBeenCalled()
  })

  it('honors a caller-provided service worker registration', async () => {
    const registration = fakeRegistration(null)
    const { register } = stubEnvironment(fakeRegistration(null))

    await getToken({ serviceWorkerRegistration: registration as unknown as ServiceWorkerRegistration })
    expect(register).not.toHaveBeenCalled()
    expect(registration.pushManager.subscribe).toHaveBeenCalled()
  })

  it('throws permission-blocked without touching the network when denied', async () => {
    const { fetchMock } = stubEnvironment(fakeRegistration(null), 'denied')

    await expect(getToken()).rejects.toMatchObject({ code: 'permission-blocked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Dismissing the prompt leaves permission at 'default' — recoverable, so the site can ask
  // again later. Blocking is not. One code for both left integrators unable to tell them apart.
  it('distinguishes a dismissed prompt from a blocked one', async () => {
    const { fetchMock } = stubEnvironment(fakeRegistration(null), 'default')

    await expect(getToken()).rejects.toMatchObject({ code: 'permission-dismissed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws unsupported when the Push API is missing', async () => {
    stubEnvironment(fakeRegistration(null))
    vi.stubGlobal('window', {})

    await expect(getToken()).rejects.toMatchObject({ code: 'unsupported' })
  })
})

describe('deleteToken', () => {
  it('unsubscribes, tells the server, clears the token, and KEEPS the installation id', async () => {
    const existing = fakeSubscription(VAPID_BYTES.slice().buffer)
    const registration = fakeRegistration(existing)
    const { fetchMock } = stubEnvironment(registration)

    await getToken()
    const installation = await idbGet(KEY_INSTALLATION)

    expect(await deleteToken()).toBe(true)
    expect(existing.unsubscribe).toHaveBeenCalled()
    const unsub = fetchMock.mock.calls.find(([url]) => (url as string).endsWith('/unsubscribe'))
    expect(unsub).toBeDefined()
    expect(await idbGet(KEY_TOKEN)).toBeUndefined()
    expect(await idbGet(KEY_INSTALLATION)).toBe(installation)
  })

  it('returns false when there is nothing to remove', async () => {
    const registration = fakeRegistration(null)
    stubEnvironment(registration)

    expect(await deleteToken()).toBe(false)
  })

  // getToken accepts a caller-supplied registration, so deleteToken must too — otherwise a site
  // managing its own worker gets the server registration removed while the browser stays
  // subscribed, and the path lookup silently resolves the wrong worker (or none).
  it('unsubscribes a caller-supplied registration', async () => {
    const own = fakeSubscription(VAPID_BYTES.slice().buffer)
    const ownRegistration = fakeRegistration(own)
    stubEnvironment(fakeRegistration(null))
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register: vi.fn(),
        // The path lookup must not be what finds the subscription here.
        getRegistration: vi.fn().mockResolvedValue(undefined),
      },
    })

    await getToken({ serviceWorkerRegistration: ownRegistration as unknown as ServiceWorkerRegistration })
    expect(
      await deleteToken({ serviceWorkerRegistration: ownRegistration as unknown as ServiceWorkerRegistration }),
    ).toBe(true)
    expect(own.unsubscribe).toHaveBeenCalled()
  })
})
