import { describe, expect, it } from 'vitest'
import { idbDel, idbGet, idbSet } from '../src/idb'

describe('idb kv', () => {
  it('round-trips a value', async () => {
    await idbSet('k1', 'v1')
    expect(await idbGet('k1')).toBe('v1')
  })

  it('returns undefined for a missing key', async () => {
    expect(await idbGet('nope')).toBeUndefined()
  })

  it('overwrites and deletes', async () => {
    await idbSet('k2', 'a')
    await idbSet('k2', 'b')
    expect(await idbGet('k2')).toBe('b')
    await idbDel('k2')
    expect(await idbGet('k2')).toBeUndefined()
  })
})
