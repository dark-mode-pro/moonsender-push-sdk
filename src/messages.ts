import { parseEnvelope, type PushPayload } from './envelope'

/** The message shape the SDK's service worker posts to window clients on every push. */
export const MESSAGE_TYPE = 'moonsender-push'

/**
 * Subscribes to pushes forwarded by the SDK's service worker while a page is open — for in-page
 * UX (badges, toasts) on top of the OS notification, which the worker always shows. Returns an
 * unsubscribe function. A no-op in unsupported browsers.
 */
export function onMessage(cb: (payload: PushPayload) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  const container = navigator.serviceWorker
  const handler = (event: Event) => {
    const data = (event as MessageEvent).data as { type?: unknown; payload?: unknown } | null
    if (data !== null && typeof data === 'object' && data.type === MESSAGE_TYPE) {
      cb(parseEnvelope(data.payload))
    }
  }
  container.addEventListener('message', handler)

  return () => container.removeEventListener('message', handler)
}
