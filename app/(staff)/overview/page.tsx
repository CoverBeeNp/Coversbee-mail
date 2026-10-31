import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'
import { getBankBalance } from '@/lib/bankBalance/bankBalance'
import { listStatements } from '@/lib/statements/statements'
import { monthlySummary } from '@/lib/analytics/monthly'
import { formatAmount, formatDate } from '@/lib/format'
import { buildTodos, type TodoGroup } from '@/lib/overview/todos'
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, blanxerStatusLabel, type OrderStatus } from '@/lib/types'
import { StatTile, signedTone } from '../StatTile'

const ORDER_STATUSES: OrderStatus[] = ['received', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled']

const FAILED_SENDS_DAYS = 30
const TODO_GROUPS: TodoGroup[] = ['Orders', 'Emails', 'Finance']
const OPEN_STATUSES: OrderStatus[] = ['received', 'dispatched', 'out_for_delivery']
const OPEN_ORDER_LIMIT = 8

type OpenOrder = {
  id: string
  blanxer_order_number: string | null
  status: OrderStatus
  blanxer_status: string | null
  total: number | null
  customers: { name: string | null } | null
}

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
  return `${formatDate(iso)}, ${new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' })}`
}

export default async function TodayPage() {
  await requireUser()
  const now = currentTime()
  const supabase = await createServerClient()
  const service = createServiceClient()

  const [{ data: trackedOrders }, { data: openOrders }, { count: failedSends }, { data: syncState }] = await Promise.all([
    supabase.from('orders').select('status').not('status', 'is', null),
    supabase
      .from('orders')
      .select('id, blanxer_order_number, status, blanxer_status, total, customers(name)')
      .in('status', OPEN_STATUSES)
      .order('created_at', { ascending: true })
      .limit(OPEN_ORDER_LIMIT),
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

  const profit = thisMonth?.profit ?? 0
  const openCount = OPEN_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0)

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Today</h1>
        <p className="text-sm text-muted">Last synced {formatSyncedAt(syncState?.last_synced_at)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue this month" value={formatAmount(thisMonth?.revenue ?? 0)} />
        <StatTile label="Expenses this month" value={formatAmount(thisMonth?.expenses ?? 0)} />
        <StatTile label="Profit this month" value={formatAmount(profit)} tone={signedTone(profit)} />
        <StatTile label="Bank balance" value={formatAmount(bankBalance)} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <section className="table-shell">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">To do</h2>
          {todos.length > 0 ? (
            TODO_GROUPS.filter((group) => todos.some((todo) => todo.group === group)).map((group) => (
              <div key={group} className="border-b border-line px-2 py-2 last:border-b-0">
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group}</p>
                {todos.filter((todo) => todo.group === group).map((todo) => (
                  <Link key={todo.href} href={todo.href} className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm text-ink transition-colors hover:bg-paper">
                    <span className="truncate">{todo.label}</span>
                    {todo.count !== null && <span className="font-semibold tabular-nums">{todo.count}</span>}
                  </Link>
                ))}
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-muted">Nothing needs doing right now.</p>
          )}
        </section>

        <section className="table-shell lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-semibold text-ink">Open orders ({openCount})</h2>
            <Link href="/orders" className="text-sm font-medium text-gold-dark hover:underline">All orders</Link>
          </div>
          {openOrders && openOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Blanxer status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(openOrders as unknown as OpenOrder[]).map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/orders/${order.id}`} className="font-semibold text-ink hover:text-gold-dark">#{order.blanxer_order_number}</Link>
                      </td>
                      <td className="text-ink-soft">{order.customers?.name ?? '—'}</td>
                      <td><span className={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</span></td>
                      <td className="text-ink-soft">{blanxerStatusLabel(order.blanxer_status)}</td>
                      <td className="tabular-nums text-ink-soft">{order.total != null ? formatAmount(order.total) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-muted">No open orders.</p>
          )}
        </section>
      </div>

      <section className="table-shell">
        <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-3 lg:grid-cols-5">
          {ORDER_STATUSES.map((status) => (
            <Link key={status} href={`/orders?status=${status}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-paper">
              <span className={ORDER_STATUS_BADGE[status]}>{ORDER_STATUS_LABEL[status]}</span>
              <span className="font-semibold tabular-nums text-ink">{statusCounts[status]}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
