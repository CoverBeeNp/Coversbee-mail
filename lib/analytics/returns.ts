import { normalizeKey, trackDisplayName, mostCommonDisplayName } from './nameGrouping'

export type OrderForReturns = {
  status: string | null
  createdAt: string
  parsedItems: { name: string; qty: number }[]
}
export type ReturnsMonth = { month: string; orders: number; cancelled: number; returned: number }
export type ProductReturns = { name: string; unitsLost: number; unitsOrdered: number; lostPercent: number }
export type ReturnsSummary = {
  months: ReturnsMonth[]
  products: ProductReturns[]
  orders: number
  cancelled: number
  returned: number
  lostPercent: number
}

const TOP_PRODUCTS = 5

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100
}

export function returnsSummary(orders: OrderForReturns[]): ReturnsSummary {
  const months = new Map<string, ReturnsMonth>()
  const ordered = new Map<string, number>()
  const lost = new Map<string, number>()
  const names = new Map<string, Map<string, number>>()

  for (const order of orders) {
    const key = order.createdAt.slice(0, 7)
    const month = months.get(key) ?? { month: key, orders: 0, cancelled: 0, returned: 0 }
    const isLost = order.status === 'Cancelled' || order.status === 'Returned'
    month.orders++
    if (order.status === 'Cancelled') month.cancelled++
    if (order.status === 'Returned') month.returned++
    months.set(key, month)

    for (const item of order.parsedItems) {
      const product = normalizeKey(item.name)
      trackDisplayName(names, product, item.name.trim())
      ordered.set(product, (ordered.get(product) ?? 0) + item.qty)
      if (isLost) lost.set(product, (lost.get(product) ?? 0) + item.qty)
    }
  }

  const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  const total = rows.reduce(
    (sum, m) => ({ orders: sum.orders + m.orders, cancelled: sum.cancelled + m.cancelled, returned: sum.returned + m.returned }),
    { orders: 0, cancelled: 0, returned: 0 }
  )

  const products = [...lost.entries()]
    .map(([key, unitsLost]) => {
      const unitsOrdered = ordered.get(key) ?? 0
      return { name: mostCommonDisplayName(names, key), unitsLost, unitsOrdered, lostPercent: percent(unitsLost, unitsOrdered) }
    })
    .sort((a, b) => b.unitsLost - a.unitsLost)
    .slice(0, TOP_PRODUCTS)

  return { months: rows, products, ...total, lostPercent: percent(total.cancelled + total.returned, total.orders) }
}
