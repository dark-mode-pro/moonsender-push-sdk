/// <reference lib="webworker" />

// The self-contained service-worker bundle (dist/sw.js). A site loads it from its OWN origin —
// service workers cannot be registered cross-origin — either by vendoring the file at
// /moonsender-sw.js, or with a one-line stub:
//
//   importScripts('https://cdn.jsdelivr.net/npm/@dark-mode-pro/moonsender-push@0/dist/sw.js')

import { handleNotificationClick, handlePush, handleSubscriptionChange } from './sw-handlers'

declare const self: ServiceWorkerGlobalScope

/**
 * Fire-and-forget tracking beacon. `redirect: 'manual'` because the click endpoint answers 301
 * for redirect-style integrations — following it would pointlessly fetch the destination from
 * the worker. Failures are swallowed: a lost beacon costs a metric, never the notification.
 */
function beacon(url: string): void {
  fetch(url, { keepalive: true, redirect: 'manual' }).catch(() => {})
}

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  event.waitUntil(
    handlePush(event.data, {
      show: (title, options) => self.registration.showNotification(title, options),
      post: async (message) => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const client of windows) client.postMessage(message)
      },
      // Best-effort delivered report: only fires when the device is online and the worker is
      // awake; never a substitute for showing the notification.
      beacon,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Both the beacon and the navigation live inside waitUntil, so the worker is not killed
  // before the click is reported.
  event.waitUntil(
    handleNotificationClick(event.notification.data, {
      beacon,
      open: async (url) => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const existing = windows[0]
        if (existing !== undefined) {
          await existing.focus()
          try {
            await existing.navigate(url)
            return
          } catch {
            // Cross-origin or uncontrolled navigation refused — fall through to a new window.
          }
        }
        await self.clients.openWindow(url)
      },
    }),
  )
})

// Not in TypeScript's ServiceWorkerGlobalScopeEventMap yet; the event object still carries
// waitUntil.
self.addEventListener('pushsubscriptionchange' as 'message', (event) => {
  ;(event as unknown as ExtendableEvent).waitUntil(handleSubscriptionChange(self.registration))
})
