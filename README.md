# @dark-mode-pro/moonsender-push

Web push SDK for self-hosted [Moonsender](https://github.com/dark-mode-pro) servers. One durable
token per browser installation, Firebase-style ergonomics, zero runtime dependencies.

```js
import { init, getToken, onMessage } from '@dark-mode-pro/moonsender-push'

// Copy this object from your Moonsender control panel (Channels → Push → your project).
init({
  baseUrl: 'https://links.example.com',
  project: 'website',
})

const token = await getToken() // permission → service worker → subscription → registration
// Send the token to your backend and bind it to the signed-in user via the Moonsender API.

onMessage((payload) => {
  // A push arrived while a page of your site was open (the OS notification is shown either way).
  console.log(payload.title, payload.body)
})
```

The token is **stable**: it is keyed on a per-browser installation id the SDK mints once, so
browser push-endpoint rotation, key rotation, and `pushsubscriptionchange` all refresh the same
registration instead of minting a new token. Call `getToken()` on every visit — each call is a
cheap refresh — and re-bind only when the returned token differs from the one you stored (which
happens only after the user cleared site data).

## Install

```sh
npm install @dark-mode-pro/moonsender-push
```

Or from a CDN, no build step:

```html
<script src="https://cdn.jsdelivr.net/npm/@dark-mode-pro/moonsender-push@1.0.0/dist/index.global.js"></script>
<script>
  MoonsenderPush.init({ baseUrl: 'https://links.example.com', project: 'website' })
</script>
```

## The service worker

Browsers require the push service worker to be served from **your** origin. Create one file at
your web root, `/moonsender-sw.js`, containing a single line:

```js
importScripts('https://cdn.jsdelivr.net/npm/@dark-mode-pro/moonsender-push@1.0.0/dist/sw.js')
```

Pin an exact version: a browser reinstalls the worker only when this stub's bytes change, so a
floating range (`@1`) leaves cached workers running indefinitely.

(Or copy `dist/sw.js` there verbatim — for example when your site must not load third-party
scripts.) If the file must live elsewhere, pass `serviceWorkerPath` to `init`.

The worker:

- shows every notification (required — subscriptions use `userVisibleOnly`),
- opens **your** destination on click, directly,
- reports delivery and clicks as **separate beacons**, so a blocked or unreachable tracking host
  costs a metric and never the user's click,
- forwards the payload to open pages (`onMessage`),
- silently re-registers when the browser rotates the subscription.

## The payload

```json
{
  "title": "Your order shipped",
  "body": "Track it from your account.",
  "icon": "https://example.com/icon.png",
  "data": {
    "url": "https://example.com/orders/42",
    "track_click_url": "https://links.example.com/link/pc/<token>",
    "track_delivery_url": "https://links.example.com/link/pd/<token>",
    "order_id": "42"
  }
}
```

`data.url` is your real destination. The two `track_*` beacons are fired by the worker — you
never call them yourself. Any other keys are whatever the send attached (the `data` object on the
send API), delivered verbatim, so `onMessage` and your own handling can read them.

## API

| Function | Behavior |
| --- | --- |
| `init(config)` | Stores `{ baseUrl, project, serviceWorkerPath? }` for all other calls. Call once. |
| `isSupported()` | `true` when service workers, the Push API, and Notifications are available. |
| `getToken(options?)` | Requests permission, registers the worker, subscribes, registers with the server, returns the token. `options.serviceWorkerRegistration` reuses your own registration. |
| `deleteToken(options?)` | Unsubscribes the browser and removes the server registration. Returns whether anything was removed. Pass the same `options.serviceWorkerRegistration` you gave `getToken`. |
| `onMessage(cb)` | Calls `cb(payload)` for pushes received while a page is open. Returns an unsubscribe function. |

All failures throw `MoonsenderPushError` with a `code` to branch on:

| Code | Meaning |
| --- | --- |
| `not-initialized` | `init` was not called |
| `invalid-config` | `init` was called with an empty `baseUrl` or `project` |
| `unsupported` | The browser cannot do web push |
| `permission-blocked` | The user blocked notifications — only they can undo it, from browser settings |
| `permission-dismissed` | The user dismissed the prompt without answering; asking again later is fine |
| `subscribe-failed` | The browser refused the push subscription |
| `request-failed` | A server call failed (network or non-OK status) |

On `request-failed` the error also carries `status`, the HTTP status of the failing response —
`404` means the project slug is unknown (or is a Firebase project, which has no public subscribe
endpoint). It is `undefined` when the request never reached the server, which is the offline
case:

```js
try {
  await getToken()
} catch (err) {
  if (err.code === 'permission-dismissed') return // ask again on a later click
  if (err.code === 'request-failed' && err.status === 404) throw new Error('check your project slug')
}
```

## Server endpoints used

Everything goes to the `baseUrl` you configured — your own Moonsender server, nobody else:

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/push/{project}/vapid-public-key` | fetched at runtime, so server key rotation needs no site deploy |
| `POST /v1/push/{project}/subscribe` | registers `{ installation_id, endpoint, keys }`, returns `{ token }` |
| `POST /v1/push/{project}/unsubscribe` | removes a registration by token |

These endpoints answer CORS directly. A project may be locked to its site's origin on the
server; localhost is always allowed, so local development works against a production project
with no extra configuration.

## Browser support

Chrome, Edge, Firefox, and Safari 16.4+ (macOS, and iOS when the site is installed to the Home
Screen). `isSupported()` is the runtime check. Web push requires a secure context: `https://` or
`http://localhost`.

## Support

Fixes land on the latest minor; upgrade to receive them.

Each major states the server contract it needs. **1.x requires a Moonsender server that serves
the `/v1/push` endpoints above**; 0.x used the unversioned paths. If you are unsure, ask your
operator whether the server answers `GET /v1/push/{project}/vapid-public-key`.

## Development

```sh
npm install
npm test           # vitest
npm run typecheck
npm run build      # dist/: index.mjs + index.global.js + index.d.ts + sw.js
```

`playground/index.html` is a manual test page: serve the repo root (`npx serve .`), open
`/playground/`, point it at a Moonsender server, and exercise getToken / deleteToken / live
pushes.

## License

[MIT](./LICENSE)
