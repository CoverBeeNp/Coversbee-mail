export type OrderForDelivery = {
  id: string
  orderNumber: string | null
  status: string | null
  createdAt: string
  deliveredAt: string | null
}
export type DeliveryMonth = { month: string; medianDays: number; orders: number }
export type DeliverySpeed = { months: DeliveryMonth[]; medianDays: number | null; p90Days: number | null; measured: number }
export type LateOrder = { id: string; orderNumber: string | null; status: string; ageDays: number }

// Median and 90th percentile, because a few orders took months and an average
// would hide the normal experience.
//
// Late means still open after this many days. 90% of orders arrive within 3.6
// days, measured from store history on 2026-10-31.
export const LATE_AFTER_DAYS = 4

const CLOSED = new Set(['Delivered', 'Cancelled', 'Returned'])
const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: string, to: string | Date): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS
}

function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

export function deliverySpeed(orders: OrderForDelivery[]): DeliverySpeed {
  const byMonth = new Map<string, number[]>()
  const all: number[] = []

  for (const order of orders) {
    if (order.status !== 'Delivered' || !order.deliveredAt) continue
    const days = daysBetween(order.createdAt, order.deliveredAt)
    if (days < 0) continue
    all.push(days)
    const month = order.createdAt.slice(0, 7)
    byMonth.set(month, [...(byMonth.get(month) ?? []), days])
  }

  const months = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, days]) => ({
      month,
      medianDays: percentile([...days].sort((a, b) => a - b), 0.5)!,
      orders: days.length,
    }))

  const sorted = all.sort((a, b) => a - b)
  return { months, medianDays: percentile(sorted, 0.5), p90Days: percentile(sorted, 0.9), measured: sorted.length }
}

export function lateOrders(orders: OrderForDelivery[], now: Date): LateOrder[] {
  return orders
    .filter((order) => order.status && !CLOSED.has(order.status))
    .map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status!,
      ageDays: daysBetween(order.createdAt, now),
    }))
    .filter((order) => order.ageDays > LATE_AFTER_DAYS)
    .sort((a, b) => b.ageDays - a.ageDays)
}
