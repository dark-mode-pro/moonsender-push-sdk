import { describe, expect, it } from 'vitest'
import { bufferSourceEqual, urlBase64ToUint8Array } from '../src/keys'

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('urlBase64ToUint8Array', () => {
  it('decodes unpadded base64url of a 65-byte P-256 point', () => {
    const bytes = new Uint8Array(65).map((_, i) => i)
    const b64 = b64url(bytes)
    expect(Array.from(urlBase64ToUint8Array(b64))).toEqual(Array.from(bytes))
  })

  it('handles - and _ characters', () => {
    const bytes = new Uint8Array([251, 239, 190])
    const b64 = b64url(bytes)
    expect(b64).toMatch(/[-_]/)
    expect(Array.from(urlBase64ToUint8Array(b64))).toEqual(Array.from(bytes))
  })
})

describe('bufferSourceEqual', () => {
  const bytes = new Uint8Array([1, 2, 3])

  it('matches an ArrayBuffer and a view with the same content', () => {
    expect(bufferSourceEqual(bytes.slice().buffer, bytes)).toBe(true)
    expect(bufferSourceEqual(new Uint8Array([1, 2, 3]), bytes)).toBe(true)
  })

  it('rejects different content, length, and absent sources', () => {
    expect(bufferSourceEqual(new Uint8Array([1, 2, 4]).buffer, bytes)).toBe(false)
    expect(bufferSourceEqual(new Uint8Array([1, 2]).buffer, bytes)).toBe(false)
    expect(bufferSourceEqual(null, bytes)).toBe(false)
    expect(bufferSourceEqual(undefined, bytes)).toBe(false)
  })
})
