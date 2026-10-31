import { describe, it, expect } from 'vitest'
import { monthWindows } from './dateWindows'

describe('monthWindows', () => {
  it('returns no windows when from >= to', () => {
    expect(monthWindows('2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')).toEqual([])
    expect(monthWindows('2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z')).toEqual([])
  })

  it('splits a range spanning exactly two calendar months into two contiguous windows', () => {
    const windows = monthWindows('2026-06-01T00:00:00Z', '2026-08-01T00:00:00Z')
    expect(windows).toEqual([
      { from: '2026-06-01T00:00:00.000Z', to: '2026-07-01T00:00:00.000Z' },
      { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    ])
  })

  it('makes the last window shorter when the range does not divide evenly by month', () => {
    const windows = monthWindows('2026-06-01T00:00:00Z', '2026-06-20T00:00:00Z')
    expect(windows).toEqual([
      { from: '2026-06-01T00:00:00.000Z', to: '2026-06-20T00:00:00.000Z' },
    ])
  })
})
