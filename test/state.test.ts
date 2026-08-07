import { beforeEach, describe, expect, it } from 'vitest'
import { MoonsenderPushError } from '../src/errors'
import { init, requireConfig, resetForTests } from '../src/state'

describe('init / requireConfig', () => {
  beforeEach(() => resetForTests())

  it('throws not-initialized before init', () => {
    try {
      requireConfig()
      expect.unreachable('must throw')
    } catch (err) {
      expect(err).toBeInstanceOf(MoonsenderPushError)
      expect((err as MoonsenderPushError).code).toBe('not-initialized')
    }
  })

  it('normalizes the base url and defaults the service worker path', () => {
    init({ baseUrl: 'https://links.example.com/', project: 'website' })
    expect(requireConfig()).toEqual({
      baseUrl: 'https://links.example.com',
      project: 'website',
      serviceWorkerPath: '/moonsender-sw.js',
    })
  })

  it('honors a custom service worker path', () => {
    init({ baseUrl: 'https://links.example.com', project: 'website', serviceWorkerPath: '/sw/push.js' })
    expect(requireConfig().serviceWorkerPath).toBe('/sw/push.js')
  })

  // Every failure is documented as a MoonsenderPushError with a code to branch on; init must
  // not be the one exception that forces callers to also catch TypeError.
  it('rejects empty config values with invalid-config', () => {
    for (const config of [
      { baseUrl: '', project: 'website' },
      { baseUrl: 'https://x.example', project: ' ' },
    ]) {
      try {
        init(config)
        expect.unreachable('must throw')
      } catch (err) {
        expect(err).toBeInstanceOf(MoonsenderPushError)
        expect((err as MoonsenderPushError).code).toBe('invalid-config')
      }
    }
  })
})
