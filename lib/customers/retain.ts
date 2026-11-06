import { isRevenueOrder } from '@/lib/analytics/orderFilters'

// Customers who have bought before but not recently, for staff to contact one
// at a time by phone or WhatsApp. Bulk email isn't an option: Zoho blocks it.
export const RETAIN_DAY_OPTIONS = [60, 90, 180, 365]
export const DEFAULT_RETAIN_DAYS = 90

type OrderForRetain = {
  customerId: string | null
  status: string
  createdAt: string
  total: number | null
  deliveryCharge: number | null
}
type CustomerForRetain = { id: string; name: string; phone: string | null; email: string | null; subscribed: boolean }
export type LapsedCustomer = CustomerForRetain & {
  orders: number
  spent: number
  lastOrderAt: string
  daysSince: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Cancelled and returned orders aren't purchases, and spending excludes the
// delivery charge, as revenue does everywhere else. Most valuable first.
export function lapsedCustomers(
  orders: OrderForRetain[],
  customers: CustomerForRetain[],
  now: Date,
  days: number
): LapsedCustomer[] {
  const totals = new Map<string, { orders: number; spent: number; lastOrderAt: string }>()
  for (const order of orders) {
    if (!order.customerId || !isRevenueOrder(order.status)) continue
    const current = totals.get(order.customerId) ?? { orders: 0, spent: 0, lastOrderAt: order.createdAt }
    current.orders++
    current.spent += (order.total ?? 0) - (order.deliveryCharge ?? 0)
    if (order.createdAt > current.lastOrderAt) current.lastOrderAt = order.createdAt
    totals.set(order.customerId, current)
  }

  return customers
    .flatMap((customer) => {
      const total = totals.get(customer.id)
      if (!total) return []
      const daysSince = Math.floor((now.getTime() - new Date(total.lastOrderAt).getTime()) / DAY_MS)
      return daysSince >= days ? [{ ...customer, ...total, daysSince }] : []
    })
    .sort((a, b) => b.spent - a.spent || b.orders - a.orders)
}
