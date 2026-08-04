/**
 * Reports whether this browser can do web push at all: service workers, the Push API, and the
 * Notification API. Note iOS Safari (16.4+) exposes all three only for an installed (added to
 * Home Screen) web app.
 */
export function isSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}
