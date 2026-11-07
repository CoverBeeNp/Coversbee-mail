// Instagram's daily figures are kept by Nepal calendar day. Nepal is UTC+5:45
// all year, with no daylight saving.
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Instagram keeps daily account insights for 90 days.
export const INSIGHTS_HISTORY_DAYS = 90
// Its figures can settle for up to 48 hours, so the last days are read again.
export const RECHECK_DAYS = 3

// The Nepal date (YYYY-MM-DD) that an instant falls on.
export function nepalDay(at: Date): string {
  return new Date(at.getTime() + NEPAL_OFFSET_MS).toISOString().slice(0, 10)
}

// The instants a Nepal day starts and ends (end exclusive).
export function nepalDayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - NEPAL_OFFSET_MS)
  return { start, end: new Date(start.getTime() + DAY_MS) }
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

// Finished days whose figures still need reading, newest first: any day in the
// last 90 not read yet, and the last few days again. Today isn't finished, so
// it isn't included.
export function daysToSync(now: Date, syncedDays: Iterable<string>): string[] {
  const synced = new Set(syncedDays)
  const today = nepalDay(now)
  const days: string[] = []
  for (let back = 1; back < INSIGHTS_HISTORY_DAYS; back++) {
    const day = addDays(today, -back)
    if (back <= RECHECK_DAYS || !synced.has(day)) days.push(day)
  }
  return days
}
