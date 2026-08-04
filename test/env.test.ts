import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSupported } from '../src/env'

afterEach(() => vi.unstubAllGlobals())

describe('isSupported', () => {
  it('is true when serviceWorker, PushManager and Notification all exist', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
    vi.stubGlobal('Notification', class {})
    expect(isSupported()).toBe(true)
  })

  it('is false when any capability is missing', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
    expect(isSupported()).toBe(false)

    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('window', {})
    expect(isSupported()).toBe(false)
  })
})
