import { describe, it, expect } from 'vitest'
import { insightsDue } from './sync'

const now = new Date('2026-11-06T06:00:00Z')

describe('insightsDue', () => {
  it('reads a post never read before', () => {
    expect(insightsDue({ timestamp: '2025-01-01T00:00:00Z' }, null, now)).toBe(true)
  })

  it('re-reads a recent post after 12 hours', () => {
    expect(insightsDue({ timestamp: '2026-11-01T00:00:00Z' }, '2026-11-05T12:00:00Z', now)).toBe(true)
    expect(insightsDue({ timestamp: '2026-11-01T00:00:00Z' }, '2026-11-06T00:00:00Z', now)).toBe(false)
  })

  it('leaves an older post alone once read', () => {
    expect(insightsDue({ timestamp: '2026-08-01T00:00:00Z' }, '2026-09-01T00:00:00Z', now)).toBe(false)
  })
})
