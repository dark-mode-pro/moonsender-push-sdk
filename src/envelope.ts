export interface PushPayloadData {
  url?: string
  report_url?: string
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
    const rawData = obj.data as Record<string, unknown>
    const data: PushPayloadData = {}
    const url = str(rawData.url)
    if (url !== undefined) data.url = url
    const reportURL = str(rawData.report_url)
    if (reportURL !== undefined) data.report_url = reportURL
    payload.data = data
  }

  return payload
}

/** Wraps raw text (or nothing) as a minimal renderable notification. */
export function fallbackEnvelope(text: string): PushPayload {
  return { title: 'Notification', body: text }
}
