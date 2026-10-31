import type { MonthlySummary } from '@/lib/analytics/monthly'
import { profitMarginPercent } from '@/lib/analytics/margin'
import { formatAmount, formatPercent } from '@/lib/format'

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatRangeLabel(monthly: MonthlySummary[], hasFilter: boolean): string {
  if (!hasFilter) return 'All time'
  if (monthly.length === 1) return formatMonthLabel(monthly[0].month)
  return `${formatMonthLabel(monthly[0].month)} to ${formatMonthLabel(monthly[monthly.length - 1].month)}`
}

function Tile({
  label,
  value,
  tone,
  format,
}: {
  label: string
  value: number
  tone: 'gold' | 'ink' | 'profit'
  format?: (value: number) => string
}) {
  const valueClass =
    tone === 'gold' ? 'text-gold-dark' : tone === 'profit' ? (value < 0 ? 'text-red-700' : 'text-emerald-700') : 'text-ink'

  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${valueClass}`}>{format ? format(value) : formatAmount(value)}</p>
    </div>
  )
}

// Tiles always sum across whatever range of months was passed in — "All
// time" (the default, no filter applied) sums the full history the same
// way "This year" sums just that year, rather than singling out the latest
// month, which would misleadingly look like a snapshot of "now" instead of
// the totals for the selected range.
export function KpiTiles({ monthly, hasFilter }: { monthly: MonthlySummary[]; hasFilter: boolean }) {
  if (monthly.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-muted">
          No orders or expenses {hasFilter ? 'in this range' : 'yet'}. Sync from Blanxer or add an expense to see numbers here.
        </p>
      </div>
    )
  }

  const summary = monthly.reduce(
    (acc, m) => ({ revenue: acc.revenue + m.revenue, expenses: acc.expenses + m.expenses, profit: acc.profit + m.profit }),
    { revenue: 0, expenses: 0, profit: 0 }
  )

  const margin = profitMarginPercent(summary.revenue, summary.profit)

  return (
    <div>
      <p className="mb-3 text-sm text-muted">{formatRangeLabel(monthly, hasFilter)}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Revenue" value={summary.revenue} tone="gold" />
        <Tile label="Expenses" value={summary.expenses} tone="ink" />
        <Tile label="Profit" value={summary.profit} tone="profit" />
        <Tile label="Margin" value={margin} tone="profit" format={formatPercent} />
      </div>
    </div>
  )
}
