import { afterEach, describe, expect, it, vi } from 'vitest'
import { KEY_CONFIG, KEY_INSTALLATION, KEY_TOKEN, idbDel, idbGet, idbSet } from '../src/idb'
import { handleNotificationClick, handlePush, handleSubscriptionChange } from '../src/sw-handlers'

afterEach(async () => {
  vi.unstubAllGlobals()
  await idbDel(KEY_CONFIG)
  await idbDel(KEY_INSTALLATION)
  await idbDel(KEY_TOKEN)
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
          data: {
            url: 'https://shop.example/orders/42',
            track_delivery_url: 'https://links.example/pd/x',
          },
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
        data: expect.objectContaining({ url: 'https://shop.example/orders/42' }),
      }),
    )
    expect(ctx.beacon).toHaveBeenCalledWith('https://links.example/pd/x')
    expect(ctx.post).toHaveBeenCalledWith({
      type: 'moonsender-push',
      payload: expect.objectContaining({ title: 'Order shipped' }),
    })
  })

  // report_url was the pre-0.4 beacon name. SDK 1.x requires a platform serving /v1/push, and
  // no such platform emits it — so it is no longer honoured, and a payload carrying only
  // report_url reports nothing rather than beaconing to a key we no longer define.
  it('does not fire a delivery beacon for the retired report_url key', async () => {
    const ctx = pushContext()
    await handlePush(
      {
        json: () => ({
          title: 'Old server',
          body: 'Legacy payload.',
          data: { url: 'https://shop.example/x', report_url: 'https://links.example/pd/legacy' },
        }),
        text: () => '',
      },
      ctx,
    )

    expect(ctx.show).toHaveBeenCalled()
    expect(ctx.beacon).not.toHaveBeenCalled()
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
    // The returned token must be stored (#166). If the server pruned the registration first,
    // re-registering mints a NEW token; dropping it leaves a stale one in IndexedDB until some
    // later page visit happens to heal it.
    expect(await idbGet(KEY_TOKEN)).toBe('stored-install-01:cred')
  })

  it('does nothing when the SDK never stored a config', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await handleSubscriptionChange(fakeRegistration())
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('handleNotificationClick', () => {
  function clickContext() {
    return { beacon: vi.fn(), open: vi.fn().mockResolvedValue(undefined) }
  }

  // The user's destination is opened directly; the click beacon is fired beside it, so an
  // unreachable tracking host can never cost the click.
  it('opens the real url and fires the click beacon', async () => {
    const ctx = clickContext()
    await handleNotificationClick(
      { url: 'https://shop.example/orders/42', track_click_url: 'https://links.example/pc/x' },
      ctx,
    )

    expect(ctx.open).toHaveBeenCalledWith('https://shop.example/orders/42')
    expect(ctx.beacon).toHaveBeenCalledWith('https://links.example/pc/x')
  })

  it('still opens the destination when no beacon was sent', async () => {
    const ctx = clickContext()
    await handleNotificationClick({ url: 'https://shop.example/orders/42' }, ctx)

    expect(ctx.open).toHaveBeenCalledWith('https://shop.example/orders/42')
    expect(ctx.beacon).not.toHaveBeenCalled()
  })

  it('falls back to the site root and tolerates absent data', async () => {
    const ctx = clickContext()
    await handleNotificationClick(undefined, ctx)

    expect(ctx.open).toHaveBeenCalledWith('/')
    expect(ctx.beacon).not.toHaveBeenCalled()
  })
})
