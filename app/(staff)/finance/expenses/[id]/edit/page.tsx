import { listExpenses } from '@/lib/expenses/expenses'
import { listExpenseCategories } from '@/lib/expenses/categories'
import { ExpenseForm } from '../../ExpenseForm'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [expenses, categories] = await Promise.all([listExpenses(), listExpenseCategories()])
  const existing = expenses.find((e) => e.id === id)
  if (!existing) notFound()

  return (
    <div className="page-narrow space-y-6">
      <h1 className="text-2xl font-bold text-ink">Edit expense</h1>
      <ExpenseForm categories={categories} existing={existing} />
    </div>
  )
}
