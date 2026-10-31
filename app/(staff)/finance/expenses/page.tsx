import Link from 'next/link'
import { listExpenses } from '@/lib/expenses/expenses'
import { listExpenseCategories } from '@/lib/expenses/categories'
import { paymentLeaderboard } from '@/lib/analytics/paymentLeaderboard'
import { DeleteExpenseButton } from './DeleteExpenseButton'
import { PaymentLeaderboard } from './PaymentLeaderboard'
import { AddExpenseModal } from './AddExpenseModal'
import { formatAmount } from '@/lib/format'
import { toCsv } from '@/lib/csv'
import { ExportCsvButton } from '../ExportCsvButton'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage() {
  const [expenses, categories] = await Promise.all([listExpenses(), listExpenseCategories()])
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const leaderboard = paymentLeaderboard(expenses.map((e) => ({ paidBy: e.paidBy, amount: e.amount })))

  const csv = toCsv(
    ['Date', 'Payment to', 'Payment by', 'Category', 'Amount (Rs)', 'Amount ($)', 'Description'],
    expenses.map((expense) => [
      expense.expenseDate,
      expense.paidTo ?? '',
      expense.paidBy ?? '',
      categoryName.get(expense.categoryId) ?? 'Unknown',
      expense.amount,
      expense.amountUsd ?? '',
      expense.note ?? '',
    ])
  )

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <div className="flex gap-2">
          <ExportCsvButton filename="expenses.csv" csv={csv} />
          <AddExpenseModal categories={categories} />
        </div>
      </div>
      <div className="mb-6">
        <PaymentLeaderboard rows={leaderboard} />
      </div>
      {expenses.length === 0 ? (
        <div className="card text-sm text-muted">No expenses yet. Add your first one using the Add expense button.</div>
      ) : (
        <div className="table-shell overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment to</th>
                <th>Payment by</th>
                <th>Category</th>
                <th>Amount (Rs)</th>
                <th>Amount ($)</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.expenseDate}</td>
                  <td>{expense.paidTo}</td>
                  <td>{expense.paidBy}</td>
                  <td>{categoryName.get(expense.categoryId) ?? 'Unknown'}</td>
                  <td className="tabular-nums">{formatAmount(expense.amount)}</td>
                  <td className="tabular-nums">{expense.amountUsd != null ? formatAmount(expense.amountUsd) : ''}</td>
                  <td>{expense.note}</td>
                  <td className="flex gap-2">
                    <Link href={`/finance/expenses/${expense.id}/edit`} className="btn-outline">Edit</Link>
                    <DeleteExpenseButton id={expense.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
