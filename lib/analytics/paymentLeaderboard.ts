import { normalizeKey, trackDisplayName, mostCommonDisplayName } from './nameGrouping'

export type ExpenseForLeaderboard = { paidBy: string | null; amount: number }
export type PaymentLeaderboardRow = { paidBy: string; total: number }

const UNSPECIFIED = 'Unspecified'

export function paymentLeaderboard(expenses: ExpenseForLeaderboard[]): PaymentLeaderboardRow[] {
  const totals = new Map<string, number>()
  const displayNameCounts = new Map<string, Map<string, number>>()

  for (const expense of expenses) {
    const displayName = expense.paidBy?.trim() || UNSPECIFIED
    const key = normalizeKey(displayName)
    totals.set(key, (totals.get(key) ?? 0) + expense.amount)
    trackDisplayName(displayNameCounts, key, displayName)
  }

  return [...totals.entries()]
    .map(([key, total]) => ({ paidBy: mostCommonDisplayName(displayNameCounts, key), total }))
    .sort((a, b) => b.total - a.total)
}
