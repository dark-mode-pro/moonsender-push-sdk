import { MoonsenderPushError } from './errors'

export interface SubscribeRequest {
  installation_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
}

async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    throw new MoonsenderPushError('request-failed', `network error calling ${url}: ${String(err)}`)
  }
}

export async function fetchVapidKey(baseUrl: string, project: string): Promise<string> {
  const resp = await call(`${baseUrl}/push/${project}/vapid-public-key`, undefined)
  if (!resp.ok) {
    throw new MoonsenderPushError('request-failed', `vapid key fetch failed: HTTP ${resp.status}`)
  }
  const body = (await resp.json()) as { public_key?: string }
  if (typeof body.public_key !== 'string' || body.public_key === '') {
    throw new MoonsenderPushError('request-failed', 'vapid key response is missing public_key')
  }

  return body.public_key
}

export async function registerSubscription(
  baseUrl: string,
  project: string,
  body: SubscribeRequest,
): Promise<string> {
  const resp = await call(`${baseUrl}/push/${project}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    throw new MoonsenderPushError('request-failed', `subscribe failed: HTTP ${resp.status}`)
  }
  const out = (await resp.json()) as { token?: string }
  if (typeof out.token !== 'string' || out.token === '') {
    throw new MoonsenderPushError('request-failed', 'subscribe response is missing token')
  }

  return out.token
}

/** Best-effort removal: a token the server no longer knows (404) is already the goal state. */
export async function removeSubscription(
  baseUrl: string,
  project: string,
  token: string,
): Promise<void> {
  const resp = await call(`${baseUrl}/push/${project}/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!resp.ok && resp.status !== 404) {
    throw new MoonsenderPushError('request-failed', `unsubscribe failed: HTTP ${resp.status}`)
  }
}
