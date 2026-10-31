export function formatAmount(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

// Dates stored without a time, or shown by calendar day, use UTC so they don't
// shift a day with the viewer's timezone. CSV exports keep ISO dates.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
