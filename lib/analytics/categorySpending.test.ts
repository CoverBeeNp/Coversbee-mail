import { describe, it, expect } from 'vitest'
import { categorySpending } from './categorySpending'

describe('categorySpending', () => {
  const now = new Date('2026-09-12T00:00:00.000Z')

  it('sums all-time, this-year, and this-month totals per category', () => {
    const result = categorySpending(
      [
        { categoryId: 'rent', amount: 500, expenseDate: '2026-09-01' },
        { categoryId: 'rent', amount: 500, expenseDate: '2026-08-01' },
        { categoryId: 'rent', amount: 500, expenseDate: '2025-01-01' },
      ],
      now
    )
    expect(result).toEqual([{ categoryId: 'rent', totalAllTime: 1500, totalThisYear: 1000, totalThisMonth: 500 }])
  })

  it('tracks multiple categories independently', () => {
    const result = categorySpending(
      [
        { categoryId: 'rent', amount: 500, expenseDate: '2026-09-01' },
        { categoryId: 'ads', amount: 100, expenseDate: '2026-09-01' },
      ],
      now
    )
    expect(result).toContainEqual({ categoryId: 'rent', totalAllTime: 500, totalThisYear: 500, totalThisMonth: 500 })
    expect(result).toContainEqual({ categoryId: 'ads', totalAllTime: 100, totalThisYear: 100, totalThisMonth: 100 })
  })

  it('returns an empty array for no expenses', () => {
    expect(categorySpending([], now)).toEqual([])
  })
})
