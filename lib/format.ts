export function formatAmount(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}
