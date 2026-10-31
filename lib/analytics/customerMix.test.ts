import { describe, it, expect } from 'vitest'
import { customerMix } from './customerMix'

const order = (customerId: string | null, createdAt: string, status = 'Delivered') => ({ customerId, createdAt, status })

describe('customerMix', () => {
  it('separates first-time and returning customers by month', () => {
    const result = customerMix([
      order('a', '2026-08-01T00:00:00Z'),
      order('a', '2026-09-01T00:00:00Z'),
      order('b', '2026-09-02T00:00:00Z'),
    ])
    expect(result.months).toEqual([
      { month: '2026-08', newCustomers: 1, returningCustomers: 0 },
      { month: '2026-09', newCustomers: 1, returningCustomers: 1 },
    ])
    expect(result.returningPercent).toBeCloseTo(33.33, 1)
  })

  it('counts two orders in a customer\'s first month as one new customer', () => {
    const result = customerMix([order('a', '2026-09-01T00:00:00Z'), order('a', '2026-09-20T00:00:00Z')])
    expect(result.months).toEqual([{ month: '2026-09', newCustomers: 1, returningCustomers: 0 }])
  })

  it('uses the full history when a date range is applied', () => {
    const result = customerMix(
      [order('a', '2026-01-01T00:00:00Z'), order('a', '2026-09-01T00:00:00Z')],
      (o) => o.createdAt >= '2026-06'
    )
    expect(result.months).toEqual([{ month: '2026-09', newCustomers: 0, returningCustomers: 1 }])
  })

  it('ignores cancelled orders and orders with no customer', () => {
    const result = customerMix([
      order('a', '2026-08-01T00:00:00Z', 'Cancelled'),
      order('a', '2026-09-01T00:00:00Z'),
      order(null, '2026-09-01T00:00:00Z'),
    ])
    expect(result.months).toEqual([{ month: '2026-09', newCustomers: 1, returningCustomers: 0 }])
  })
})
