import { isRevenueOrder } from './orderFilters'
import { normalizeKey, trackDisplayName, mostCommonDisplayName } from './nameGrouping'

type ItemForColor = { color: string | null; lineTotal: number; qty: number }
export type OrderForColor = { status: string; parsedItems: ItemForColor[] }
export type ColorPerformance = { color: string; revenue: number; unitsSold: number }

export function colorPerformance(orders: OrderForColor[]): ColorPerformance[] {
  const revenueTotals = new Map<string, number>()
  const unitTotals = new Map<string, number>()
  const displayNameCounts = new Map<string, Map<string, number>>()

  for (const order of orders) {
    if (!isRevenueOrder(order.status)) continue
    for (const item of order.parsedItems) {
      if (!item.color) continue
      const key = normalizeKey(item.color)
      revenueTotals.set(key, (revenueTotals.get(key) ?? 0) + item.lineTotal)
      unitTotals.set(key, (unitTotals.get(key) ?? 0) + item.qty)
      trackDisplayName(displayNameCounts, key, item.color)
    }
  }

  return [...revenueTotals.entries()]
    .map(([key, revenue]) => ({
      color: mostCommonDisplayName(displayNameCounts, key),
      revenue,
      unitsSold: unitTotals.get(key) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}
