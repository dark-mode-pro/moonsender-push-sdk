/**
 * The notification's data object: your destination, the two tracking beacons, and whatever keys
 * the send attached. Navigation and tracking are independent — the worker opens `url` directly
 * and fetches the beacons separately, so a tracking outage never costs the click.
 */
export interface PushPayloadData {
  /** Your real destination, delivered exactly as sent. */
  url?: string
  /** Beacon: fetch to record a click. */
  track_click_url?: string
  /** Beacon: fetch to record delivery. */
  track_delivery_url?: string
  /** Caller-supplied keys, delivered verbatim. */
  [key: string]: string | undefined
}

/** The notification envelope a Moonsender server delivers, verbatim. */
export interface PushPayload {
  title: string
  body: string
  icon?: string
  image?: string
  data?: PushPayloadData
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Tolerant envelope parse: unknown fields are dropped, missing ones defaulted, and a non-object
 * input becomes a plain-text notification — a malformed payload must still render something
 * (the subscription was created with userVisibleOnly).
 */
export function parseEnvelope(raw: unknown): PushPayload {
  if (typeof raw !== 'object' || raw === null) {
    return fallbackEnvelope(typeof raw === 'string' ? raw : '')
  }

  const obj = raw as Record<string, unknown>
  const payload: PushPayload = {
    title: str(obj.title) ?? 'Notification',
    body: str(obj.body) ?? '',
  }
  const icon = str(obj.icon)
  if (icon !== undefined) payload.icon = icon
  const image = str(obj.image)
  if (image !== undefined) payload.image = image

  if (typeof obj.data === 'object' && obj.data !== null) {
    // Every string key is kept: the platform's own keys plus whatever the sender attached, so
    // caller data reaches onMessage and the click handler untouched.
    const data: PushPayloadData = {}
    for (const [key, value] of Object.entries(obj.data as Record<string, unknown>)) {
      const asString = str(value)
      if (asString !== undefined) data[key] = asString
    }
    payload.data = data
  }

  return payload
}

/** Wraps raw text (or nothing) as a minimal renderable notification. */
export function fallbackEnvelope(text: string): PushPayload {
  return { title: 'Notification', body: text }
}
