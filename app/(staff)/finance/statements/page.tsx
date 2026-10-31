import Link from 'next/link'
import { listStatements } from '@/lib/statements/statements'
import { GenerateStatementForm } from './GenerateStatementForm'
import { formatAmount, formatDate, formatPercent } from '@/lib/format'

export const dynamic = 'force-dynamic'

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function StatementsPage() {
  const statements = await listStatements()

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-6 py-10">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-ink">Monthly statements</h1>
        <p className="text-sm text-muted">
          Each statement locks in that month&apos;s numbers as a permanent record, even if you add or correct older orders and expenses later.
        </p>
      </div>

      <div className="card">
        <GenerateStatementForm />
      </div>

      {statements.length === 0 ? (
        <div className="card text-sm text-muted">No statements generated yet. Pick a month above to create your first one.</div>
      ) : (
        <div className="table-shell overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Revenue</th>
                <th>Expenses</th>
                <th>Profit</th>
                <th>Margin</th>
                <th>Generated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => (
                <tr key={statement.month}>
                  <td>{formatMonthLabel(statement.month)}</td>
                  <td className="tabular-nums">{formatAmount(statement.revenue)}</td>
                  <td className="tabular-nums">{formatAmount(statement.expenses)}</td>
                  <td className={`tabular-nums ${statement.profit < 0 ? 'text-negative' : 'text-positive'}`}>
                    {formatAmount(statement.profit)}
                  </td>
                  <td className="tabular-nums">{formatPercent(statement.marginPercent)}</td>
                  <td className="text-muted">{formatDate(statement.generatedAt)}</td>
                  <td>
                    <Link href={`/finance/statements/${statement.month}`} className="btn-outline">View</Link>
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
