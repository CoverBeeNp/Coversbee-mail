import { describe, it, expect } from 'vitest'
import { formatAmount, formatPercent, formatDate } from './format'

describe('formatAmount', () => {
  it('formats a whole number with exactly one decimal place', () => {
    expect(formatAmount(123213)).toBe('123,213.0')
  })

  it('rounds to one decimal place', () => {
    expect(formatAmount(103638.456)).toBe('103,638.5')
  })

  it('keeps a negative sign', () => {
    expect(formatAmount(-211130.11)).toBe('-211,130.1')
  })
})

describe('formatPercent', () => {
  it('formats with exactly two decimal places and a trailing percent sign', () => {
    expect(formatPercent(74.5)).toBe('74.50%')
  })

  it('rounds to two decimal places', () => {
    expect(formatPercent(-27.638)).toBe('-27.64%')
  })
})

describe('formatDate', () => {
  it('shows one date format, unaffected by the time of day', () => {
    expect(formatDate('2026-10-31')).toBe('Oct 31, 2026')
    expect(formatDate('2026-10-31T23:30:00.000Z')).toBe('Oct 31, 2026')
  })
})
