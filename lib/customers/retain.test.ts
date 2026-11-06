import { describe, it, expect } from 'vitest'
import { lapsedCustomers } from './retain'

const now = new Date('2026-11-05T00:00:00Z')
const customer = (id: string) => ({ id, name: id, phone: null, email: null, subscribed: false })
const order = (customerId: string, createdAt: string, total: number, status = 'Delivered') => ({
  customerId,
  status,
  createdAt,
  total,
  deliveryCharge: 100,
})

describe('lapsedCustomers', () => {
  it('lists customers whose last real order is old enough, most valuable first', () => {
    const result = lapsedCustomers(
      [
        order('a', '2026-05-01T00:00:00Z', 1100),
        order('b', '2026-04-01T00:00:00Z', 2100),
        order('b', '2026-06-01T00:00:00Z', 1100),
        order('c', '2026-10-20T00:00:00Z', 900),
      ],
      [customer('a'), customer('b'), customer('c')],
      now,
      90
    )
    expect(result.map((c) => [c.id, c.orders, c.spent, c.lastOrderAt])).toEqual([
      ['b', 2, 3000, '2026-06-01T00:00:00Z'],
      ['a', 1, 1000, '2026-05-01T00:00:00Z'],
    ])
  })

  it('ignores cancelled and returned orders', () => {
    const result = lapsedCustomers(
      [order('a', '2026-01-01T00:00:00Z', 1000, 'Cancelled'), order('b', '2026-01-01T00:00:00Z', 1000, 'Returned')],
      [customer('a'), customer('b')],
      now,
      90
    )
    expect(result).toEqual([])
  })

  it('treats a recent cancelled order as no recent purchase', () => {
    const result = lapsedCustomers(
      [order('a', '2026-01-01T00:00:00Z', 1000), order('a', '2026-11-01T00:00:00Z', 1000, 'Cancelled')],
      [customer('a')],
      now,
      90
    )
    expect(result.map((c) => c.id)).toEqual(['a'])
  })
})
