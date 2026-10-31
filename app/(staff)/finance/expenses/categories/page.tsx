import { listExpenseCategories } from '@/lib/expenses/categories'
import { listExpenses } from '@/lib/expenses/expenses'
import { categorySpending } from '@/lib/analytics/categorySpending'
import { CategoryForm } from './CategoryForm'
import { DeleteCategoryButton } from './DeleteCategoryButton'
import { formatAmount } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const [categories, expenses] = await Promise.all([listExpenseCategories(), listExpenses()])
  const spendingByCategory = new Map(
    categorySpending(expenses, new Date()).map((row) => [row.categoryId, row])
  )

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Expense categories</h1>
      <CategoryForm />
      {categories.length === 0 ? (
        <div className="card text-sm text-muted">No categories yet. Add your first one above.</div>
      ) : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>This month</th>
                <th>This year</th>
                <th>All time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const spending = spendingByCategory.get(category.id)
                return (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td className="tabular-nums">{formatAmount(spending?.totalThisMonth ?? 0)}</td>
                    <td className="tabular-nums">{formatAmount(spending?.totalThisYear ?? 0)}</td>
                    <td className="tabular-nums">{formatAmount(spending?.totalAllTime ?? 0)}</td>
                    <td>
                      <DeleteCategoryButton id={category.id} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
