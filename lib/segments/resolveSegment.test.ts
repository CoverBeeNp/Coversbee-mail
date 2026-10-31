import { describe, it, expect, vi } from 'vitest'
import { matchesSegment, resolveSegmentCustomerIds } from './resolveSegment'

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

describe('resolveSegmentCustomerIds', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock supabase query builder
  function client(tables: Record<string, unknown[][]>): any {
    // fetchAllRows calls from() once per page, so pages are consumed per table.
    const remaining = Object.fromEntries(Object.entries(tables).map(([table, pages]) => [table, [...pages]]))
    return {
      from: (table: string) => {
        const range = vi.fn(async () => ({ data: remaining[table].shift() ?? [], error: null }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chainable stand-in
        const builder: any = { order: () => builder, range }
        return { select: () => builder }
      },
    }
  }

  it('includes customers beyond the first 1000 rows', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, subscribed_to_marketing: true }))
    const ids = await resolveSegmentCustomerIds(
      client({ customers: [firstPage, [{ id: 'c1000', subscribed_to_marketing: true }]], orders: [[]] }),
      { type: 'all_subscribed' }
    )
    expect(ids).toHaveLength(1001)
  })

  it('excludes unsubscribed customers and ignores orders with no customer', async () => {
    const ids = await resolveSegmentCustomerIds(
      client({
        customers: [[{ id: 'yes', subscribed_to_marketing: true }, { id: 'no', subscribed_to_marketing: false }]],
        orders: [[{ customer_id: null, created_at: '2026-10-01T00:00:00Z' }]],
      }),
      { type: 'all_subscribed' }
    )
    expect(ids).toEqual(['yes'])
  })

  it("uses each customer's latest order for recent segments", async () => {
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const ids = await resolveSegmentCustomerIds(
      client({
        customers: [[{ id: 'c1', subscribed_to_marketing: true }]],
        orders: [[{ customer_id: 'c1', created_at: '2020-01-01T00:00:00Z' }, { customer_id: 'c1', created_at: recent }]],
      }),
      { type: 'recent_customers', days: 7 }
    )
    expect(ids).toEqual(['c1'])
  })
})
