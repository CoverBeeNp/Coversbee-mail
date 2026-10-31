import { describe, it, expect } from 'vitest'
import { expenseBreakdown } from './expenseBreakdown'

describe('expenseBreakdown', () => {
  it('sums amounts per category name', () => {
    const result = expenseBreakdown([
      { categoryName: 'Rent', amount: 500 },
      { categoryName: 'Ads', amount: 100 },
      { categoryName: 'Rent', amount: 500 },
    ])
    expect(result).toEqual([
      { categoryName: 'Rent', total: 1000 },
      { categoryName: 'Ads', total: 100 },
    ])
  })

  it('returns an empty array for no expenses', () => {
    expect(expenseBreakdown([])).toEqual([])
  })
})
