import { describe, it, expect } from 'vitest'
import { isWithinRange } from './dateRange'

describe('isWithinRange', () => {
  it('is true for any date when no bounds are given', () => {
    expect(isWithinRange('2026-08-15', undefined, undefined)).toBe(true)
  })

  it('excludes dates before "from"', () => {
    expect(isWithinRange('2026-08-01', '2026-08-15', undefined)).toBe(false)
    expect(isWithinRange('2026-08-15', '2026-08-15', undefined)).toBe(true)
  })

  it('excludes dates after "to", inclusive of the "to" day itself', () => {
    expect(isWithinRange('2026-08-20', undefined, '2026-08-15')).toBe(false)
    expect(isWithinRange('2026-08-15', undefined, '2026-08-15')).toBe(true)
  })

  it('handles a full timestamp by comparing only the calendar date', () => {
    expect(isWithinRange('2026-08-15T23:59:59.000Z', '2026-08-15', '2026-08-15')).toBe(true)
    expect(isWithinRange('2026-08-16T00:00:01.000Z', '2026-08-15', '2026-08-15')).toBe(false)
  })

  it('applies both bounds together', () => {
    expect(isWithinRange('2026-08-10', '2026-08-01', '2026-08-31')).toBe(true)
    expect(isWithinRange('2026-09-01', '2026-08-01', '2026-08-31')).toBe(false)
  })
})
