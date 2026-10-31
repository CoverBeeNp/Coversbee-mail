import { describe, it, expect } from 'vitest'
import { profitMarginPercent } from './margin'

describe('profitMarginPercent', () => {
  it('computes profit as a percentage of revenue', () => {
    expect(profitMarginPercent(1000, 250)).toBe(25)
  })

  it('returns a negative percentage for a loss', () => {
    expect(profitMarginPercent(1000, -100)).toBe(-10)
  })

  it('returns 0 when revenue is 0, avoiding a division by zero', () => {
    expect(profitMarginPercent(0, 0)).toBe(0)
    expect(profitMarginPercent(0, -50)).toBe(0)
  })
})
