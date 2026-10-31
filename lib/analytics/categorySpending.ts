export type ExpenseForCategorySpending = { categoryId: string; amount: number; expenseDate: string }
export type CategorySpending = { categoryId: string; totalAllTime: number; totalThisYear: number; totalThisMonth: number }

// "now" is passed in rather than read from Date.now() so this stays a pure,
// deterministic function to test — the caller (the categories page) passes
// the real current time.
export function categorySpending(expenses: ExpenseForCategorySpending[], now: Date): CategorySpending[] {
  const nowIso = now.toISOString().slice(0, 10)
  const currentYear = nowIso.slice(0, 4)
  const currentMonth = nowIso.slice(0, 7)

  const totals = new Map<string, CategorySpending>()
  for (const expense of expenses) {
    const existing = totals.get(expense.categoryId) ?? {
      categoryId: expense.categoryId,
      totalAllTime: 0,
      totalThisYear: 0,
      totalThisMonth: 0,
    }
    existing.totalAllTime += expense.amount
    if (expense.expenseDate.startsWith(currentYear)) existing.totalThisYear += expense.amount
    if (expense.expenseDate.startsWith(currentMonth)) existing.totalThisMonth += expense.amount
    totals.set(expense.categoryId, existing)
  }

  return [...totals.values()]
}
