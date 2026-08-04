/// <reference lib="webworker" />

// The self-contained service-worker bundle (dist/sw.js). A site loads it from its OWN origin —
// service workers cannot be registered cross-origin — either by vendoring the file at
// /moonsender-sw.js, or with a one-line stub:
//
//   importScripts('https://cdn.jsdelivr.net/npm/moonsender-push@0/dist/sw.js')

import { clickTargetURL, handlePush, handleSubscriptionChange } from './sw-handlers'

declare const self: ServiceWorkerGlobalScope

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
      beacon: (url) => {
        // Best-effort delivered report: only fires when the device is online and the worker is
        // awake; never a substitute for showing the notification.
        fetch(url, { keepalive: true }).catch(() => {})
      },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = clickTargetURL(event.notification.data)
  event.waitUntil(
    (async () => {
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
    })(),
  )
})

// Not in TypeScript's ServiceWorkerGlobalScopeEventMap yet; the event object still carries
// waitUntil.
self.addEventListener('pushsubscriptionchange' as 'message', (event) => {
  ;(event as unknown as ExtendableEvent).waitUntil(handleSubscriptionChange(self.registration))
})
