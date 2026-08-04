/** Decodes a base64url VAPID public key into the raw bytes the Push API wants. */
export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  // Explicit ArrayBuffer backing: applicationServerKey wants BufferSource, and TS 5.7's generic
  // typed arrays reject an ArrayBufferLike-backed view there.
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)

  return out
}

/**
 * Compares an existing subscription's applicationServerKey (BufferSource or absent) against the
 * server's current key bytes — the rotation check.
 */
export function bufferSourceEqual(a: BufferSource | null | undefined, b: Uint8Array): boolean {
  if (a == null) return false
  const aBytes: Uint8Array<ArrayBufferLike> =
    a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  if (aBytes.length !== b.length) return false
  for (let i = 0; i < aBytes.length; i++) {
    if (aBytes[i] !== b[i]) return false
  }

  return true
}
