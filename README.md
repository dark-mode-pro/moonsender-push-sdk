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
| `deleteToken()` | Unsubscribes the browser and removes the server registration. Returns whether anything was removed. |
| `onMessage(cb)` | Calls `cb(payload)` for pushes received while a page is open. Returns an unsubscribe function. |

All failures throw `MoonsenderPushError` with a `code` to branch on:

| Code | Meaning |
| --- | --- |
| `not-initialized` | `init` was not called |
| `unsupported` | The browser cannot do web push |
| `permission-blocked` | The user denied (or has blocked) notifications |
| `subscribe-failed` | The browser refused the push subscription |
| `request-failed` | A server call failed (network or non-OK status) |

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
