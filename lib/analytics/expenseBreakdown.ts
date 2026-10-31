export type ExpenseForBreakdown = { categoryName: string; amount: number }
export type ExpenseBreakdownRow = { categoryName: string; total: number }

export function expenseBreakdown(expenses: ExpenseForBreakdown[]): ExpenseBreakdownRow[] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    totals.set(expense.categoryName, (totals.get(expense.categoryName) ?? 0) + expense.amount)
  }
  return [...totals.entries()]
    .map(([categoryName, total]) => ({ categoryName, total }))
    .sort((a, b) => b.total - a.total)
}
