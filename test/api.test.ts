import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchVapidKey, registerSubscription, removeSubscription } from '../src/api'
import { MoonsenderPushError } from '../src/errors'

const BASE = 'https://links.example.com'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchVapidKey', () => {
  it('GETs the per-project key endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { public_key: 'PUBKEY' }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchVapidKey(BASE, 'website')).toBe('PUBKEY')
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/v1/push/website/vapid-public-key`, undefined)
  })

  it('maps a non-OK status to request-failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})))
    await expect(fetchVapidKey(BASE, 'nope')).rejects.toMatchObject({ code: 'request-failed' })
  })
})

describe('registerSubscription', () => {
  it('POSTs the registration and returns the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { token: 'inst:cred' }))
    vi.stubGlobal('fetch', fetchMock)

    const token = await registerSubscription(BASE, 'website', {
      installation_id: 'inst',
      endpoint: 'https://gateway.example/ep',
      keys: { p256dh: 'p', auth: 'a' },
    })

    expect(token).toBe('inst:cred')
    const [url, initArg] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/v1/push/website/subscribe`)
    expect(initArg.method).toBe('POST')
    expect(new Headers(initArg.headers).get('content-type')).toContain('application/json')
    expect(JSON.parse(initArg.body as string)).toEqual({
      installation_id: 'inst',
      endpoint: 'https://gateway.example/ep',
      keys: { p256dh: 'p', auth: 'a' },
    })
  })

  it('wraps network failures as request-failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(
      registerSubscription(BASE, 'website', {
        installation_id: 'i',
        endpoint: 'e',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    ).rejects.toBeInstanceOf(MoonsenderPushError)
  })
})

describe('removeSubscription', () => {
  it('POSTs the token and tolerates 404 (already gone)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await removeSubscription(BASE, 'website', 'tok')
    await removeSubscription(BASE, 'website', 'tok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces server failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    await expect(removeSubscription(BASE, 'website', 'tok')).rejects.toMatchObject({
      code: 'request-failed',
    })
  })
})
