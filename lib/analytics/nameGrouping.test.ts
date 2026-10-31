import { describe, it, expect } from 'vitest'
import { normalizeKey, trackDisplayName, mostCommonDisplayName } from './nameGrouping'

describe('normalizeKey', () => {
  it('trims whitespace and lowercases', () => {
    expect(normalizeKey('  Silicon ')).toBe('silicon')
    expect(normalizeKey('SIlicon')).toBe('silicon')
  })
})

describe('trackDisplayName / mostCommonDisplayName', () => {
  it('picks the display name that occurred most often for a given key', () => {
    const counts = new Map<string, Map<string, number>>()
    trackDisplayName(counts, 'silicon', 'SIlicon')
    trackDisplayName(counts, 'silicon', 'Silicon')
    trackDisplayName(counts, 'silicon', 'Silicon')
    trackDisplayName(counts, 'silicon', 'silicon')
    expect(mostCommonDisplayName(counts, 'silicon')).toBe('Silicon')
  })
})
