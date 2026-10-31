import { describe, it, expect } from 'vitest'
import { normalizePhoneModel } from './phoneModel'

describe('normalizePhoneModel', () => {
  it('maps R to the bare model, matching Blanxer\'s own naming with no space or suffix', () => {
    expect(normalizePhoneModel('13R')).toBe('iPhone 13')
    expect(normalizePhoneModel('11R')).toBe('iPhone 11')
  })

  it('maps P to Pro, with no space, matching Blanxer\'s "14Pro" convention', () => {
    expect(normalizePhoneModel('13P')).toBe('iPhone 13Pro')
  })

  it('maps PM to Promax, matching Blanxer\'s "13Promax" convention', () => {
    expect(normalizePhoneModel('13PM')).toBe('iPhone 13Promax')
  })

  it('maps PL to Plus', () => {
    expect(normalizePhoneModel('14PL')).toBe('iPhone 14Plus')
  })

  it('is case-insensitive on the suffix', () => {
    expect(normalizePhoneModel('13pm')).toBe('iPhone 13Promax')
  })

  it('leaves an unrecognized format unchanged rather than guessing', () => {
    expect(normalizePhoneModel('Not found')).toBe('Not found')
  })

  it('returns null for a null input', () => {
    expect(normalizePhoneModel(null)).toBeNull()
  })
})
