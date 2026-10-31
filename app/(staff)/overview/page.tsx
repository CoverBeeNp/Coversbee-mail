import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'
import { getBankBalance } from '@/lib/bankBalance/bankBalance'
import { listStatements } from '@/lib/statements/statements'
import { monthlySummary } from '@/lib/analytics/monthly'
import { formatAmount } from '@/lib/format'
import { buildTodos } from '@/lib/overview/todos'
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types'

const ORDER_STATUSES: OrderStatus[] = ['received', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled']

const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'badge-neutral',
  dispatched: 'badge-gold',
  out_for_delivery: 'badge-gold',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
}

const FAILED_SENDS_DAYS = 30

type OrderRow = { total: number | null; delivery_charge: number | null; status: string; created_at: string }
type ExpenseRow = { amount: number; expense_date: string }

// Pulled out of the page component so the "impure function during render"
// lint rule (aimed at client component re-renders) doesn't apply here —
// this Server Component runs fresh per request regardless.
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function currentTime(): Date {
  return new Date()
}

function formatSyncedAt(iso: string | undefined): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function TodayPage() {
  await requireUser()
  const now = currentTime()
  const supabase = await createServerClient()
  const service = createServiceClient()

  const [{ data: trackedOrders }, { count: failedSends }, { data: syncState }] = await Promise.all([
    supabase.from('orders').select('status').not('status', 'is', null),
    supabase
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .eq('type', 'transactional')
      .gte('sent_at', daysAgoIso(FAILED_SENDS_DAYS)),
    service.from('blanxer_sync_state').select('last_synced_at').eq('id', true).single(),
  ])

  const statusCounts: Record<OrderStatus, number> = { received: 0, dispatched: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 }
  for (const order of trackedOrders ?? []) statusCounts[order.status as OrderStatus]++

  const [orders, expenses, statements, bankBalance] = await Promise.all([
    fetchAllRows<OrderRow>(service, 'orders', 'id, total, delivery_charge, status:blanxer_status, created_at', 'created_at'),
    fetchAllRows<ExpenseRow>(service, 'expenses', 'id, amount, expense_date', 'expense_date'),
    listStatements(),
    getBankBalance(),
  ])

  // Revenue excludes the delivery charge, as on the finance dashboard.
  const monthly = monthlySummary(
    orders.map((o) => ({ total: (o.total ?? 0) - (o.delivery_charge ?? 0), status: o.status, createdAt: o.created_at })),
    expenses.map((e) => ({ amount: e.amount, expenseDate: e.expense_date }))
  )
  const thisMonth = monthly.find((m) => m.month === now.toISOString().slice(0, 7))

  const todos = buildTodos({
    received: statusCounts.received,
    dispatched: statusCounts.dispatched,
    outForDelivery: statusCounts.out_for_delivery,
    failedSends: failedSends ?? 0,
    statementMonths: statements.map((s) => s.month),
    now,
  })

  const money = [
    { label: 'Revenue this month', value: thisMonth?.revenue ?? 0, tone: 'text-gold-dark' },
    { label: 'Expenses this month', value: thisMonth?.expenses ?? 0, tone: 'text-ink' },
    { label: 'Profit this month', value: thisMonth?.profit ?? 0, tone: (thisMonth?.profit ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700' },
    { label: 'Bank balance', value: bankBalance, tone: 'text-ink' },
  ]

  return (
    <div className="page space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Today</h1>
        <p className="mt-1 text-sm text-muted">Last synced from Blanxer: {formatSyncedAt(syncState?.last_synced_at)}</p>
      </div>

      <section>
        <p className="field-label mb-3">To do</p>
        {todos.length > 0 ? (
          <div className="table-shell divide-y divide-line">
            {todos.map((todo) => (
              <Link key={todo.href} href={todo.href} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-paper">
                <span>
                  <span className="block font-semibold text-ink">{todo.label}</span>
                  <span className="block text-sm text-muted">{todo.detail}</span>
                </span>
                <span className="flex items-center gap-3">
                  {todo.count !== null && <span className="badge-gold tabular-nums">{todo.count}</span>}
                  <span aria-hidden className="text-muted">→</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card text-center text-sm text-muted">Nothing needs doing right now.</div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="field-label">Money</p>
          <Link href="/finance" className="text-sm font-medium text-gold-dark hover:underline">Open finance</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {money.map((item) => (
            <div key={item.label} className="card">
              <p className="text-sm text-muted">{item.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${item.tone}`}>{formatAmount(item.value)}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="field-label">Orders</p>
          <Link href="/orders" className="text-sm font-medium text-gold-dark hover:underline">View all</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_STATUSES.map((status) => (
            <Link key={status} href={`/orders?status=${status}`} className="card block text-center transition-colors hover:border-gold-dark">
              <p className="text-2xl font-bold tabular-nums text-ink">{statusCounts[status]}</p>
              <span className={`${ORDER_STATUS_BADGE[status]} mt-2`}>{ORDER_STATUS_LABEL[status]}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
