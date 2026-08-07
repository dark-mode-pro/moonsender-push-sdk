import { fetchVapidKey, registerSubscription } from './api'
import { fallbackEnvelope, parseEnvelope, type PushPayload, type PushPayloadData } from './envelope'
import { KEY_CONFIG, KEY_INSTALLATION, KEY_TOKEN, idbGet, idbSet } from './idb'
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
  const deliveryBeacon = payload.data?.track_delivery_url
  if (deliveryBeacon !== undefined) {
    ctx.beacon(deliveryBeacon)
  }
  await ctx.post({ type: 'moonsender-push', payload })
}

export interface ClickContext {
  beacon(url: string): void
  open(url: string): Promise<void>
}

/**
 * The click pipeline: open the user's real destination, and report the click as a separate
 * beacon. The two are independent on purpose — if the tracking host is blocked or unreachable,
 * the user still lands on the page.
 */
export async function handleNotificationClick(
  data: PushPayloadData | undefined,
  ctx: ClickContext,
): Promise<void> {
  if (data?.track_click_url !== undefined && data.track_click_url !== '') {
    ctx.beacon(data.track_click_url)
  }

  await ctx.open(clickTargetURL(data))
}

/** The click destination: the caller's own URL, falling back to the site root. */
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

  const token = await registerSubscription(cfg.baseUrl, cfg.project, {
    installation_id: installationID,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })

  // Usually the same token as before — same installation, so the server preserves it. But if
  // the registration was pruned first (dead gateway at send time), this mints a NEW one, and
  // dropping it would leave a stale token in IndexedDB until the next page visit.
  await idbSet(KEY_TOKEN, token)
}
