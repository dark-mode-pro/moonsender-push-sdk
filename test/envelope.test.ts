import { describe, expect, it } from 'vitest'
import { fallbackEnvelope, parseEnvelope } from '../src/envelope'

describe('parseEnvelope', () => {
  it('maps a full server envelope', () => {
    const payload = parseEnvelope({
      title: 'Order shipped',
      body: 'Track it from your account.',
      icon: 'https://site.example/icon.png',
      image: 'https://site.example/hero.png',
      data: { url: 'https://links.example/link/pc/x', report_url: 'https://links.example/link/pd/x' },
    })
    expect(payload).toEqual({
      title: 'Order shipped',
      body: 'Track it from your account.',
      icon: 'https://site.example/icon.png',
      image: 'https://site.example/hero.png',
      data: { url: 'https://links.example/link/pc/x', report_url: 'https://links.example/link/pd/x' },
    })
  })

  it('keeps the tracking beacons and caller data keys', () => {
    const payload = parseEnvelope({
      title: 'Hi',
      body: 'There',
      data: {
        url: 'https://shop.example/orders/42',
        track_click_url: 'https://links.example/link/pc/x',
        track_delivery_url: 'https://links.example/link/pd/x',
        order_id: '42',
      },
    })
    expect(payload.data).toEqual({
      url: 'https://shop.example/orders/42',
      track_click_url: 'https://links.example/link/pc/x',
      track_delivery_url: 'https://links.example/link/pd/x',
      order_id: '42',
    })
  })

  it('defaults missing title and body, drops non-string fields', () => {
    const payload = parseEnvelope({ icon: 42, data: { url: 1 } })
    expect(payload.title).toBe('Notification')
    expect(payload.body).toBe('')
    expect(payload.icon).toBeUndefined()
    expect(payload.data?.url).toBeUndefined()
  })

  it('treats a non-object as a fallback text body', () => {
    expect(parseEnvelope('plain text')).toEqual({ title: 'Notification', body: 'plain text' })
    expect(parseEnvelope(null)).toEqual({ title: 'Notification', body: '' })
  })
})

describe('fallbackEnvelope', () => {
  it('wraps raw text', () => {
    expect(fallbackEnvelope('hi')).toEqual({ title: 'Notification', body: 'hi' })
  })
})
