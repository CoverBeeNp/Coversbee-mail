import { describe, it, expect } from 'vitest'
import { previousMonthKey } from './monthKey'

describe('previousMonthKey', () => {
  it('returns the prior month within the same year', () => {
    expect(previousMonthKey('2026-03')).toBe('2026-02')
  })

  it('rolls back across a year boundary', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12')
  })
})
