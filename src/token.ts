import { fetchVapidKey, registerSubscription, removeSubscription } from './api'
import { isSupported } from './env'
import { MoonsenderPushError } from './errors'
import { KEY_CONFIG, KEY_INSTALLATION, KEY_TOKEN, idbDel, idbGet, idbSet } from './idb'
import { bufferSourceEqual, urlBase64ToUint8Array } from './keys'
import { requireConfig } from './state'

/** Returns the durable installation id, minting it exactly once per browser profile. */
async function ensureInstallationID(): Promise<string> {
  const existing = await idbGet(KEY_INSTALLATION)
  if (existing !== undefined) return existing

  const minted = crypto.randomUUID()
  await idbSet(KEY_INSTALLATION, minted)

  return minted
}

function ensureSupported(): void {
  if (!isSupported()) {
    throw new MoonsenderPushError('unsupported', 'web push is not supported in this browser')
  }
}

export interface GetTokenOptions {
  /** Use an existing registration instead of registering the configured serviceWorkerPath. */
  serviceWorkerRegistration?: ServiceWorkerRegistration
}

/**
 * The one call a site needs: ensures permission, the service worker, a push subscription, and a
 * server registration — returning the subscription token to bind to your user. Safe to call on
 * every visit: the token is stable per installation, and each call refreshes the registration
 * (a rotated browser endpoint is updated in place server-side).
 */
export async function getToken(options?: GetTokenOptions): Promise<string> {
  ensureSupported()
  const cfg = requireConfig()

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }
  if (permission !== 'granted') {
    throw new MoonsenderPushError('permission-blocked', 'notification permission was not granted')
  }

  const registration =
    options?.serviceWorkerRegistration ??
    (await navigator.serviceWorker.register(cfg.serviceWorkerPath))

  const installationID = await ensureInstallationID()
  const publicKey = await fetchVapidKey(cfg.baseUrl, cfg.project)
  const keyBytes = urlBase64ToUint8Array(publicKey)

  let subscription = await registration.pushManager.getSubscription()
  if (subscription !== null && !bufferSourceEqual(subscription.options.applicationServerKey, keyBytes)) {
    // The server's VAPID key changed: the old subscription can never be delivered to again.
    await subscription.unsubscribe()
    subscription = null
  }
  if (subscription === null) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes,
      })
    } catch (err) {
      throw new MoonsenderPushError('subscribe-failed', `push subscription failed: ${String(err)}`)
    }
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new MoonsenderPushError('subscribe-failed', 'browser returned an incomplete subscription')
  }

  const token = await registerSubscription(cfg.baseUrl, cfg.project, {
    installation_id: installationID,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })

  await idbSet(KEY_TOKEN, token)
  // The service worker needs these to re-register on pushsubscriptionchange without a page.
  await idbSet(KEY_CONFIG, JSON.stringify({ baseUrl: cfg.baseUrl, project: cfg.project }))

  return token
}

/**
 * Unsubscribes the browser and removes the server registration. The installation id is kept on
 * purpose — it is this browser profile's durable identity, and a later getToken() reuses it.
 */
export async function deleteToken(): Promise<boolean> {
  ensureSupported()
  const cfg = requireConfig()
  let removed = false

  const registration = await navigator.serviceWorker.getRegistration(cfg.serviceWorkerPath)
  const subscription = (await registration?.pushManager.getSubscription()) ?? null
  if (subscription !== null) {
    await subscription.unsubscribe()
    removed = true
  }

  const token = await idbGet(KEY_TOKEN)
  if (token !== undefined) {
    await removeSubscription(cfg.baseUrl, cfg.project, token)
    await idbDel(KEY_TOKEN)
    removed = true
  }

  return removed
}
