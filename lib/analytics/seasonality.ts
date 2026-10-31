import type { MonthlySummary } from './monthly'

// `years` lists which calendar years contributed to this month's average —
// with a partial history (e.g. 14 months of data), some calendar months
// only ever occurred once (say, only in 2025) while others occurred twice
// (2025 and 2026), so their averages aren't directly comparable without
// knowing the sample behind each one.
export type SeasonalityRow = { calendarMonth: number; average: number; years: number[] }
export type SeasonalityMetric = 'revenue' | 'unitsSold'

export function seasonality(monthly: MonthlySummary[], metric: SeasonalityMetric = 'revenue'): SeasonalityRow[] {
  const byCalendarMonth = new Map<number, { value: number; year: number }[]>()
  for (const row of monthly) {
    const year = Number(row.month.slice(0, 4))
    const calendarMonth = Number(row.month.slice(5, 7))
    const entries = byCalendarMonth.get(calendarMonth) ?? []
    entries.push({ value: row[metric], year })
    byCalendarMonth.set(calendarMonth, entries)
  }

  return Array.from({ length: 12 }, (_, i) => {
    const calendarMonth = i + 1
    const entries = byCalendarMonth.get(calendarMonth) ?? []
    const average = entries.length ? entries.reduce((sum, e) => sum + e.value, 0) / entries.length : 0
    const years = entries.map((e) => e.year).sort((a, b) => a - b)
    return { calendarMonth, average, years }
  })
}
