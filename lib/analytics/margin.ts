export function profitMarginPercent(revenue: number, profit: number): number {
  if (revenue === 0) return 0
  return (profit / revenue) * 100
}
