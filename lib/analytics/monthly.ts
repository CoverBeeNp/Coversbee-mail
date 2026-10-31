import { isRevenueOrder } from './orderFilters'

export type OrderRow = { total: number; status: string; createdAt: string; parsedItems?: { qty: number }[] }
export type ExpenseRow = { amount: number; expenseDate: string }
export type MonthlySummary = { month: string; revenue: number; expenses: number; profit: number; unitsSold: number }

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7) // 'YYYY-MM'
}

export function monthlySummary(orders: OrderRow[], expenses: ExpenseRow[]): MonthlySummary[] {
  const revenueByMonth = new Map<string, number>()
  const unitsByMonth = new Map<string, number>()
  for (const order of orders) {
    if (!isRevenueOrder(order.status)) continue
    const key = monthKey(order.createdAt)
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + order.total)
    const units = (order.parsedItems ?? []).reduce((sum, item) => sum + item.qty, 0)
    unitsByMonth.set(key, (unitsByMonth.get(key) ?? 0) + units)
  }

  const expensesByMonth = new Map<string, number>()
  for (const expense of expenses) {
    const key = monthKey(expense.expenseDate)
    expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + expense.amount)
  }

  const months = new Set([...revenueByMonth.keys(), ...expensesByMonth.keys()])
  return [...months].sort().map((month) => {
    const revenue = revenueByMonth.get(month) ?? 0
    const expensesTotal = expensesByMonth.get(month) ?? 0
    return {
      month,
      revenue,
      expenses: expensesTotal,
      profit: revenue - expensesTotal,
      unitsSold: unitsByMonth.get(month) ?? 0,
    }
  })
}
