import { afterEach, describe, expect, it, vi } from 'vitest'
import { KEY_CONFIG, KEY_INSTALLATION, idbDel, idbSet } from '../src/idb'
import { clickTargetURL, handlePush, handleSubscriptionChange } from '../src/sw-handlers'

afterEach(async () => {
  vi.unstubAllGlobals()
  await idbDel(KEY_CONFIG)
  await idbDel(KEY_INSTALLATION)
})

function pushContext() {
  return {
    show: vi.fn().mockResolvedValue(undefined),
    post: vi.fn().mockResolvedValue(undefined),
    beacon: vi.fn(),
  }
}

describe('handlePush', () => {
  it('shows the notification, fires the delivered beacon, and forwards to pages', async () => {
    const ctx = pushContext()
    await handlePush(
      {
        json: () => ({
          title: 'Order shipped',
          body: 'Track it.',
          icon: 'https://s.example/i.png',
          data: { url: 'https://links.example/pc/x', report_url: 'https://links.example/pd/x' },
        }),
        text: () => '',
      },
      ctx,
    )

    expect(ctx.show).toHaveBeenCalledWith(
      'Order shipped',
      expect.objectContaining({
        body: 'Track it.',
        icon: 'https://s.example/i.png',
        data: expect.objectContaining({ url: 'https://links.example/pc/x' }),
      }),
    )
    expect(ctx.beacon).toHaveBeenCalledWith('https://links.example/pd/x')
    expect(ctx.post).toHaveBeenCalledWith({
      type: 'moonsender-push',
      payload: expect.objectContaining({ title: 'Order shipped' }),
    })
  })

  it('falls back to text for a non-JSON payload and still shows a notification', async () => {
    const ctx = pushContext()
    await handlePush(
      {
        json: () => {
          throw new SyntaxError('bad json')
        },
        text: () => 'plain words',
      },
      ctx,
    )

    expect(ctx.show).toHaveBeenCalledWith('Notification', expect.objectContaining({ body: 'plain words' }))
    expect(ctx.beacon).not.toHaveBeenCalled()
  })

  it('handles a data-less push', async () => {
    const ctx = pushContext()
    await handlePush(null, ctx)
    expect(ctx.show).toHaveBeenCalledWith('Notification', expect.objectContaining({ body: '' }))
  })
})

describe('clickTargetURL', () => {
  it('uses data.url when present, falls back to /', () => {
    expect(clickTargetURL({ url: 'https://links.example/pc/x' })).toBe('https://links.example/pc/x')
    expect(clickTargetURL({})).toBe('/')
    expect(clickTargetURL(undefined)).toBe('/')
    expect(clickTargetURL({ url: 42 })).toBe('/')
  })
})

describe('handleSubscriptionChange', () => {
  const VAPID_B64 = ((bytes: Uint8Array): string => {
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  })(new Uint8Array(65).map((_, i) => i + 1))

  function fakeRegistration() {
    return {
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({
          toJSON: () => ({ endpoint: 'https://gateway.example/new', keys: { p256dh: 'P', auth: 'A' } }),
        }),
      },
    } as unknown as ServiceWorkerRegistration
  }

  it('re-registers the fresh subscription under the stored installation', async () => {
    await idbSet(KEY_CONFIG, JSON.stringify({ baseUrl: 'https://links.example.com', project: 'website' }))
    await idbSet(KEY_INSTALLATION, 'stored-install-01')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/vapid-public-key')) {
        return new Response(JSON.stringify({ public_key: VAPID_B64 }), { status: 200 })
      }
      if (url.endsWith('/subscribe')) {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>
        expect(body.installation_id).toBe('stored-install-01')
        expect(body.endpoint).toBe('https://gateway.example/new')
        return new Response(JSON.stringify({ token: 'stored-install-01:cred' }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await handleSubscriptionChange(fakeRegistration())

    expect(fetchMock.mock.calls.some(([url]) => (url as string).endsWith('/subscribe'))).toBe(true)
  })

  it('does nothing when the SDK never stored a config', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await handleSubscriptionChange(fakeRegistration())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
