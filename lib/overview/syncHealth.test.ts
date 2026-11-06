import { describe, it, expect } from 'vitest'
import { isSyncStale } from './syncHealth'

const now = new Date('2026-11-05T12:00:00Z')

describe('isSyncStale', () => {
  it('is stale when no sync has ever completed', () => {
    expect(isSyncStale(null, now)).toBe(true)
    expect(isSyncStale(undefined, now)).toBe(true)
  })

  it('is fresh within two hours', () => {
    expect(isSyncStale('2026-11-05T10:30:00Z', now)).toBe(false)
  })

  it('is stale after two hours', () => {
    expect(isSyncStale('2026-11-05T09:59:00Z', now)).toBe(true)
  })
})
