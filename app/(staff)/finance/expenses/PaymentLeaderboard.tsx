import type { PaymentLeaderboardRow } from '@/lib/analytics/paymentLeaderboard'
import { formatAmount } from '@/lib/format'

export function PaymentLeaderboard({ rows }: { rows: PaymentLeaderboardRow[] }) {
  if (rows.length === 0) return null

  const highest = rows[0].total

  return (
    <div className="card">
      <h2 className="mb-4 font-semibold">Payment leaderboard</h2>
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.paidBy} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-sm font-semibold text-muted">{i + 1}</span>
            <span className="w-28 shrink-0 truncate font-medium">{row.paidBy}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-gold" style={{ width: `${(row.total / highest) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums font-semibold">{formatAmount(row.total)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
