import { describe, it, expect } from 'vitest'
import { returnsSummary } from './returns'

const order = (status: string | null, createdAt: string, name = 'Silicon', qty = 1) => ({
  status,
  createdAt,
  parsedItems: [{ name, qty }],
})

describe('returnsSummary', () => {
  it('counts cancelled and returned orders by month, in date order', () => {
    const result = returnsSummary([
      order('Delivered', '2026-09-02T00:00:00Z'),
      order('Returned', '2026-09-03T00:00:00Z'),
      order('Cancelled', '2026-08-03T00:00:00Z'),
    ])
    expect(result.months).toEqual([
      { month: '2026-08', orders: 1, cancelled: 1, returned: 0 },
      { month: '2026-09', orders: 2, cancelled: 0, returned: 1 },
    ])
    expect(result).toMatchObject({ orders: 3, cancelled: 1, returned: 1 })
    expect(result.lostPercent).toBeCloseTo(66.67, 1)
  })

  it('ranks products by units lost and groups spellings together', () => {
    const { products } = returnsSummary([
      order('Returned', '2026-09-01T00:00:00Z', 'Silicon', 2),
      order('Delivered', '2026-09-01T00:00:00Z', 'SIlicon', 2),
      order('Cancelled', '2026-09-01T00:00:00Z', 'Mirror', 1),
    ])
    expect(products[0]).toMatchObject({ unitsLost: 2, unitsOrdered: 4, lostPercent: 50 })
    expect(products[1]).toMatchObject({ name: 'Mirror', unitsLost: 1 })
  })

  it('handles no orders', () => {
    expect(returnsSummary([])).toMatchObject({ months: [], products: [], lostPercent: 0 })
  })
})
