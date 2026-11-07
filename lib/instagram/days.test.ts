import { describe, it, expect } from 'vitest'
import { daysToSync, nepalDay, nepalDayBounds } from './days'

describe('nepalDay', () => {
  it('moves to the next day at 18:15 UTC', () => {
    expect(nepalDay(new Date('2026-11-05T18:14:00Z'))).toBe('2026-11-05')
    expect(nepalDay(new Date('2026-11-05T18:15:00Z'))).toBe('2026-11-06')
  })
})

describe('nepalDayBounds', () => {
  it('starts at Nepal midnight and lasts a day', () => {
    const { start, end } = nepalDayBounds('2026-11-06')
    expect(start.toISOString()).toBe('2026-11-05T18:15:00.000Z')
    expect(end.toISOString()).toBe('2026-11-06T18:15:00.000Z')
  })
})

describe('daysToSync', () => {
  const now = new Date('2026-11-06T06:00:00Z') // 2026-11-06 in Nepal

  it('asks for 89 finished days, newest first, when nothing is stored', () => {
    const days = daysToSync(now, [])
    expect(days).toHaveLength(89)
    expect(days[0]).toBe('2026-11-05')
    expect(days.at(-1)).toBe('2026-08-09')
    expect(days).not.toContain('2026-11-06')
  })

  it('re-reads only the last three days once the rest are stored', () => {
    const stored = daysToSync(now, [])
    expect(daysToSync(now, stored)).toEqual(['2026-11-05', '2026-11-04', '2026-11-03'])
  })
})
