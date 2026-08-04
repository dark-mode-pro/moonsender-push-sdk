import { afterEach, describe, expect, it, vi } from 'vitest'
import { onMessage } from '../src/messages'

afterEach(() => vi.unstubAllGlobals())

function stubServiceWorkerContainer(): EventTarget {
  const container = new EventTarget()
  vi.stubGlobal('navigator', { serviceWorker: container })
  return container
}

describe('onMessage', () => {
  it('delivers SDK push messages and ignores foreign ones', () => {
    const container = stubServiceWorkerContainer()
    const seen: unknown[] = []
    onMessage((payload) => seen.push(payload))

    container.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'moonsender-push', payload: { title: 'Hi', body: 'there' } },
      }),
    )
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }))
    container.dispatchEvent(new MessageEvent('message', { data: null }))

    expect(seen).toEqual([{ title: 'Hi', body: 'there' }])
  })

  it('stops delivering after unsubscribe', () => {
    const container = stubServiceWorkerContainer()
    const cb = vi.fn()
    const unsubscribe = onMessage(cb)
    unsubscribe()

    container.dispatchEvent(
      new MessageEvent('message', { data: { type: 'moonsender-push', payload: { title: 'x', body: '' } } }),
    )
    expect(cb).not.toHaveBeenCalled()
  })

  it('is a no-op without service worker support', () => {
    vi.stubGlobal('navigator', {})
    expect(() => onMessage(() => {})()).not.toThrow()
  })
})
