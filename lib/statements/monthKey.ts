export function previousMonthKey(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, m - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
