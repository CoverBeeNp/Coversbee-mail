import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getStatement } from '@/lib/statements/statements'
import { DeleteStatementButton } from './DeleteStatementButton'
import { PrintButton } from './PrintButton'
import { formatAmount, formatDate, formatPercent } from '@/lib/format'
import { toCsv } from '@/lib/csv'
import { ExportCsvButton } from '../../ExportCsvButton'
import { StatTile, signedTone } from '../../../StatTile'

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function deltaLabel(current: number, previous: number | null): string | null {
  if (previous === null) return null
  if (previous === 0) return null
  const percent = ((current - previous) / Math.abs(previous)) * 100
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${formatPercent(percent)} vs prior month`
}

export default async function StatementDetailPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params
  const statement = await getStatement(month)
  if (!statement) notFound()

  const revenueDelta = deltaLabel(statement.revenue, statement.prevMonthRevenue)
  const profitDelta = deltaLabel(statement.profit, statement.prevMonthProfit)

  const csv = toCsv(
    ['Section', 'Name', 'Value'],
    [
      ['Summary', 'Revenue', statement.revenue],
      ['Summary', 'Expenses', statement.expenses],
      ['Summary', 'Profit', statement.profit],
      ['Summary', 'Margin %', statement.marginPercent],
      ['Summary', 'Opening balance', statement.openingBalance ?? ''],
      ['Summary', 'Closing balance', statement.closingBalance],
      ...statement.categoryBreakdown.map((row) => ['Expense category', row.categoryName, row.total]),
      ...statement.topProducts.map((row) => ['Top product', row.name, row.revenue]),
      ...statement.topColors.map((row) => ['Top color', row.color, row.revenue]),
      ...statement.topDeviceModels.map((row) => ['Top device model', row.model, row.unitsSold]),
    ] as (string | number)[][]
  )

  return (
    <div className="page-narrow space-y-6 print:max-w-none print:p-0">
      <div className="flex items-center gap-3 border-b border-line pb-6">
        <Image src="/logo.png" alt="" width={44} height={44} />
        <div>
          <p className="text-lg font-bold leading-tight">CoversBee</p>
          <p className="text-sm text-muted">Monthly Financial Statement</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-ink">{formatMonthLabel(statement.month)}</h1>
          <p className="text-sm text-muted">Generated {formatDate(statement.generatedAt)} — figures locked at generation time.</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <ExportCsvButton filename={`statement-${statement.month}.csv`} csv={csv} />
          <PrintButton />
          <DeleteStatementButton month={statement.month} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Revenue" value={formatAmount(statement.revenue)} note={revenueDelta} />
        <StatTile label="Expenses" value={formatAmount(statement.expenses)} />
        <StatTile label="Profit" value={formatAmount(statement.profit)} tone={signedTone(statement.profit)} note={profitDelta} />
        <StatTile label="Margin" value={formatPercent(statement.marginPercent)} tone={signedTone(statement.marginPercent)} />
      </div>

      <section className="card">
        <h2 className="mb-4 font-semibold">Bank balance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted">Opening</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {statement.openingBalance === null ? 'Not available' : formatAmount(statement.openingBalance)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted">Closing</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatAmount(statement.closingBalance)}</p>
          </div>
          <div>
            <p className="text-sm text-muted">As of</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatDate(statement.balanceAsOf)}</p>
          </div>
        </div>
        {statement.openingBalance === null && (
          <p className="mt-3 text-xs text-muted">
            Opening balance wasn&apos;t recorded when this statement was generated.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">Expenses by category</h2>
        {statement.categoryBreakdown.length === 0 ? (
          <p className="text-sm text-muted">No expenses recorded this month.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {statement.categoryBreakdown.map((row) => (
                <tr key={row.categoryName} className="border-b border-line last:border-b-0">
                  <td className="py-2">{row.categoryName}</td>
                  <td className="py-2 text-right tabular-nums">{formatAmount(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 print:grid-cols-3">
        <section className="card">
          <h2 className="mb-4 font-semibold">Top products</h2>
          {statement.topProducts.length === 0 ? (
            <p className="text-sm text-muted">No sales this month.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {statement.topProducts.map((row) => (
                <li key={row.name} className="flex justify-between">
                  <span>{row.name}</span>
                  <span className="tabular-nums text-muted">{formatAmount(row.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Top colors</h2>
          {statement.topColors.length === 0 ? (
            <p className="text-sm text-muted">No sales this month.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {statement.topColors.map((row) => (
                <li key={row.color} className="flex justify-between">
                  <span>{row.color}</span>
                  <span className="tabular-nums text-muted">{formatAmount(row.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Top device models</h2>
          {statement.topDeviceModels.length === 0 ? (
            <p className="text-sm text-muted">No sales this month.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {statement.topDeviceModels.map((row) => (
                <li key={row.model} className="flex justify-between">
                  <span>{row.model}</span>
                  <span className="tabular-nums text-muted">{row.unitsSold.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
