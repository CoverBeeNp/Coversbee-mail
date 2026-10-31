import type { MonthlySummary } from '@/lib/analytics/monthly'
import { profitMarginPercent } from '@/lib/analytics/margin'
import { formatAmount, formatPercent } from '@/lib/format'
import { StatTile, signedTone } from '../StatTile'

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue" value={formatAmount(summary.revenue)} />
        <StatTile label="Expenses" value={formatAmount(summary.expenses)} />
        <StatTile label="Profit" value={formatAmount(summary.profit)} tone={signedTone(summary.profit)} />
        <StatTile label="Margin" value={formatPercent(margin)} tone={signedTone(margin)} />
      </div>
    </div>
  )
}
