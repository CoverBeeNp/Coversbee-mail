import { describe, it, expect } from 'vitest'
import { paymentLeaderboard } from './paymentLeaderboard'

describe('paymentLeaderboard', () => {
  it('sums total paid per person, sorted descending', () => {
    const result = paymentLeaderboard([
      { paidBy: 'Yamash', amount: 500 },
      { paidBy: 'Upendra', amount: 1000 },
      { paidBy: 'Yamash', amount: 300 },
    ])
    expect(result).toEqual([
      { paidBy: 'Upendra', total: 1000 },
      { paidBy: 'Yamash', total: 800 },
    ])
  })

  it('groups a missing/null payer under "Unspecified"', () => {
    const result = paymentLeaderboard([{ paidBy: null, amount: 200 }])
    expect(result).toEqual([{ paidBy: 'Unspecified', total: 200 }])
  })

  it('trims whitespace and groups case-insensitively, keeping the most common casing', () => {
    const result = paymentLeaderboard([
      { paidBy: 'coversbee', amount: 100 },
      { paidBy: 'Coversbee', amount: 200 },
      { paidBy: 'Coversbee ', amount: 300 },
    ])
    expect(result).toEqual([{ paidBy: 'Coversbee', total: 600 }])
  })

  it('returns an empty array for no expenses', () => {
    expect(paymentLeaderboard([])).toEqual([])
  })
})
