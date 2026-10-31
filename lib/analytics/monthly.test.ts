import { describe, it, expect } from 'vitest'
import { monthlySummary } from './monthly'

describe('monthlySummary', () => {
  it('sums revenue and expenses per month and computes profit', () => {
    const result = monthlySummary(
      [
        { total: 1000, status: 'Delivered', createdAt: '2026-08-05T00:00:00Z' },
        { total: 500, status: 'Delivered', createdAt: '2026-08-20T00:00:00Z' },
        { total: 700, status: 'Delivered', createdAt: '2026-09-01T00:00:00Z' },
      ],
      [
        { amount: 300, expenseDate: '2026-08-15' },
        { amount: 100, expenseDate: '2026-09-01' },
      ]
    )

    expect(result).toEqual([
      { month: '2026-08', revenue: 1500, expenses: 300, profit: 1200, unitsSold: 0 },
      { month: '2026-09', revenue: 700, expenses: 100, profit: 600, unitsSold: 0 },
    ])
  })

  it('sums item quantities per month as unitsSold', () => {
    const result = monthlySummary(
      [
        { total: 1000, status: 'Delivered', createdAt: '2026-08-05T00:00:00Z', parsedItems: [{ qty: 2 }, { qty: 1 }] },
        { total: 500, status: 'Delivered', createdAt: '2026-08-20T00:00:00Z', parsedItems: [{ qty: 3 }] },
      ],
      []
    )
    expect(result).toEqual([{ month: '2026-08', revenue: 1500, expenses: 0, profit: 1500, unitsSold: 6 }])
  })

  it('excludes units from cancelled orders', () => {
    const result = monthlySummary(
      [
        { total: 1000, status: 'Delivered', createdAt: '2026-08-05T00:00:00Z', parsedItems: [{ qty: 2 }] },
        { total: 500, status: 'Cancelled', createdAt: '2026-08-10T00:00:00Z', parsedItems: [{ qty: 5 }] },
      ],
      []
    )
    expect(result).toEqual([{ month: '2026-08', revenue: 1000, expenses: 0, profit: 1000, unitsSold: 2 }])
  })

  it('excludes cancelled orders from revenue', () => {
    const result = monthlySummary(
      [
        { total: 1000, status: 'Delivered', createdAt: '2026-08-05T00:00:00Z' },
        { total: 500, status: 'Cancelled', createdAt: '2026-08-10T00:00:00Z' },
      ],
      []
    )
    expect(result).toEqual([{ month: '2026-08', revenue: 1000, expenses: 0, profit: 1000, unitsSold: 0 }])
  })

  it('excludes returned (refunded) orders from revenue', () => {
    const result = monthlySummary(
      [
        { total: 1000, status: 'Delivered', createdAt: '2026-08-05T00:00:00Z' },
        { total: 500, status: 'Returned', createdAt: '2026-08-10T00:00:00Z' },
      ],
      []
    )
    expect(result).toEqual([{ month: '2026-08', revenue: 1000, expenses: 0, profit: 1000, unitsSold: 0 }])
  })

  it('includes a month that only has expenses', () => {
    const result = monthlySummary([], [{ amount: 200, expenseDate: '2026-07-01' }])
    expect(result).toEqual([{ month: '2026-07', revenue: 0, expenses: 200, profit: -200, unitsSold: 0 }])
  })

  it('returns an empty array for no data', () => {
    expect(monthlySummary([], [])).toEqual([])
  })
})
