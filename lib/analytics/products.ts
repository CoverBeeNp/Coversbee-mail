import { isRevenueOrder } from './orderFilters'
import { normalizeKey, trackDisplayName, mostCommonDisplayName } from './nameGrouping'

export type ParsedItemRow = { name: string; lineTotal: number; qty: number }
export type OrderForProducts = { status: string; parsedItems: ParsedItemRow[] }
export type ProductPerformance = { name: string; revenue: number; unitsSold: number }

export function productPerformance(orders: OrderForProducts[]): ProductPerformance[] {
  const revenueTotals = new Map<string, number>()
  const unitTotals = new Map<string, number>()
  const displayNameCounts = new Map<string, Map<string, number>>()

  for (const order of orders) {
    if (!isRevenueOrder(order.status)) continue
    for (const item of order.parsedItems) {
      const key = normalizeKey(item.name)
      revenueTotals.set(key, (revenueTotals.get(key) ?? 0) + item.lineTotal)
      unitTotals.set(key, (unitTotals.get(key) ?? 0) + item.qty)
      trackDisplayName(displayNameCounts, key, item.name.trim())
    }
  }

  return [...revenueTotals.entries()]
    .map(([key, revenue]) => ({
      name: mostCommonDisplayName(displayNameCounts, key),
      revenue,
      unitsSold: unitTotals.get(key) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}
