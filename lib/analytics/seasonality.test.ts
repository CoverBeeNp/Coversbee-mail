import { describe, it, expect } from 'vitest'
import { seasonality } from './seasonality'

describe('seasonality', () => {
  it('returns 12 rows, one per calendar month', () => {
    const result = seasonality([])
    expect(result).toHaveLength(12)
    expect(result.map((r) => r.calendarMonth)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(result.every((r) => r.average === 0)).toBe(true)
    expect(result.every((r) => r.years.length === 0)).toBe(true)
  })

  it('averages the same calendar month across multiple years, using revenue by default', () => {
    const result = seasonality([
      { month: '2025-08', revenue: 1000, expenses: 0, profit: 1000, unitsSold: 0 },
      { month: '2026-08', revenue: 2000, expenses: 0, profit: 2000, unitsSold: 0 },
      { month: '2026-09', revenue: 300, expenses: 0, profit: 300, unitsSold: 0 },
    ])
    const august = result.find((r) => r.calendarMonth === 8)
    const september = result.find((r) => r.calendarMonth === 9)
    expect(august?.average).toBe(1500)
    expect(september?.average).toBe(300)
  })

  it('averages by unitsSold when that metric is requested', () => {
    const result = seasonality(
      [
        { month: '2025-08', revenue: 1000, expenses: 0, profit: 1000, unitsSold: 4 },
        { month: '2026-08', revenue: 2000, expenses: 0, profit: 2000, unitsSold: 10 },
      ],
      'unitsSold'
    )
    const august = result.find((r) => r.calendarMonth === 8)
    expect(august?.average).toBe(7)
  })

  it('records which years contributed to each calendar month, so a single-year average can be told apart from a multi-year one', () => {
    const result = seasonality([
      { month: '2025-08', revenue: 1000, expenses: 0, profit: 1000, unitsSold: 0 },
      { month: '2026-08', revenue: 2000, expenses: 0, profit: 2000, unitsSold: 0 },
      { month: '2025-10', revenue: 500, expenses: 0, profit: 500, unitsSold: 0 },
    ])
    const august = result.find((r) => r.calendarMonth === 8)
    const october = result.find((r) => r.calendarMonth === 10)
    const december = result.find((r) => r.calendarMonth === 12)
    expect(august?.years).toEqual([2025, 2026])
    expect(october?.years).toEqual([2025])
    expect(december?.years).toEqual([])
  })
})
