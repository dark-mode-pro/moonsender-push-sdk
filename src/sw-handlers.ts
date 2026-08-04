import { fetchVapidKey, registerSubscription } from './api'
import { fallbackEnvelope, parseEnvelope, type PushPayload } from './envelope'
import { KEY_CONFIG, KEY_INSTALLATION, idbGet } from './idb'
import { urlBase64ToUint8Array } from './keys'

export interface PushEventDataLike {
  json(): unknown
  text(): string
}

export interface PushContext {
  show(title: string, options: NotificationOptions & { image?: string }): Promise<void>
  post(message: { type: 'moonsender-push'; payload: PushPayload }): Promise<void>
  beacon(url: string): void
}

/**
 * The push pipeline: always show a notification (the subscription was created with
 * userVisibleOnly — skipping it eventually gets the subscription revoked), fire the best-effort
 * delivered beacon, and forward the payload to any open pages.
 */
export async function handlePush(data: PushEventDataLike | null, ctx: PushContext): Promise<void> {
  let payload: PushPayload
  if (data === null) {
    payload = fallbackEnvelope('')
  } else {
    try {
      payload = parseEnvelope(data.json())
    } catch {
      payload = fallbackEnvelope(data.text())
    }
  }

  const options: NotificationOptions & { image?: string } = {
    body: payload.body,
    data: payload.data ?? {},
  }
  if (payload.icon !== undefined) options.icon = payload.icon
  if (payload.image !== undefined) options.image = payload.image

  await ctx.show(payload.title, options)
  if (payload.data?.report_url !== undefined) {
    ctx.beacon(payload.data.report_url)
  }
  await ctx.post({ type: 'moonsender-push', payload })
}

/**
 * The click destination. data.url is the server's tracking redirect — open it verbatim (the
 * click is recorded, then the browser is redirected to the real target); fall back to the site
 * root.
 */
export function clickTargetURL(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const url = (data as Record<string, unknown>).url
    if (typeof url === 'string' && url !== '') return url
  }

  return '/'
}

/**
 * pushsubscriptionchange recovery, without any page open: re-subscribe with the current server
 * key and re-register under the stored installation id — same installation, same token, so the
 * server-side binding survives the browser's rotation.
 */
export async function handleSubscriptionChange(registration: ServiceWorkerRegistration): Promise<void> {
  const [configRaw, installationID] = await Promise.all([idbGet(KEY_CONFIG), idbGet(KEY_INSTALLATION)])
  if (configRaw === undefined || installationID === undefined) return

  let cfg: { baseUrl?: unknown; project?: unknown }
  try {
    cfg = JSON.parse(configRaw) as { baseUrl?: unknown; project?: unknown }
  } catch {
    return
  }
  if (typeof cfg.baseUrl !== 'string' || typeof cfg.project !== 'string') return

  const publicKey = await fetchVapidKey(cfg.baseUrl, cfg.project)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return

  await registerSubscription(cfg.baseUrl, cfg.project, {
    installation_id: installationID,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
}
