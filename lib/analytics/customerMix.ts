import { isRevenueOrder } from './orderFilters'

export type OrderForMix = { status: string; createdAt: string; customerId: string | null }
type CustomerMonth = { month: string; newCustomers: number; returningCustomers: number }
export type CustomerMix = {
  months: CustomerMonth[]
  newCustomers: number
  returningCustomers: number
  returningPercent: number
}

// `allOrders` must be the full history even when `inRange` narrows what's shown,
// otherwise a loyal customer's first order in the range would look like their
// first ever. Cancelled and returned orders aren't real purchases, so they
// don't make someone a customer.
export function customerMix(
  allOrders: OrderForMix[],
  inRange: (order: OrderForMix) => boolean = () => true
): CustomerMix {
  const firstMonth = new Map<string, string>()
  const seen = new Map<string, Set<string>>()

  const real = allOrders
    .filter((order) => order.customerId && isRevenueOrder(order.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  for (const order of real) {
    const customer = order.customerId!
    const month = order.createdAt.slice(0, 7)
    if (!firstMonth.has(customer)) firstMonth.set(customer, month)
    if (!inRange(order)) continue
    const customers = seen.get(month) ?? new Set<string>()
    customers.add(customer)
    seen.set(month, customers)
  }

  const months = [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, customers]) => {
      const newCustomers = [...customers].filter((customer) => firstMonth.get(customer) === month).length
      return { month, newCustomers, returningCustomers: customers.size - newCustomers }
    })

  const newCustomers = months.reduce((sum, m) => sum + m.newCustomers, 0)
  const returningCustomers = months.reduce((sum, m) => sum + m.returningCustomers, 0)
  const active = newCustomers + returningCustomers

  return { months, newCustomers, returningCustomers, returningPercent: active === 0 ? 0 : (returningCustomers / active) * 100 }
}
