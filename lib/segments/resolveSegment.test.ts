import { describe, it, expect } from 'vitest'
import { matchesSegment } from './resolveSegment'

describe('matchesSegment', () => {
  const now = new Date('2026-08-20T00:00:00Z')

  it('all_subscribed matches only subscribed customers', () => {
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: null }, { type: 'all_subscribed' }, now)).toBe(true)
    expect(matchesSegment({ subscribedToMarketing: false, lastOrderAt: null }, { type: 'all_subscribed' }, now)).toBe(false)
  })

  it('recent_customers matches subscribed customers with an order within N days', () => {
    const filter = { type: 'recent_customers' as const, days: 30 }
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: '2026-08-01T00:00:00Z' }, filter, now)).toBe(true)
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: '2026-01-01T00:00:00Z' }, filter, now)).toBe(false)
    expect(matchesSegment({ subscribedToMarketing: true, lastOrderAt: null }, filter, now)).toBe(false)
    expect(matchesSegment({ subscribedToMarketing: false, lastOrderAt: '2026-08-01T00:00:00Z' }, filter, now)).toBe(false)
  })
})
