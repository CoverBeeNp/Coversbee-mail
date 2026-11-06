import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'
import { DEFAULT_RETAIN_DAYS, RETAIN_DAY_OPTIONS, lapsedCustomers } from '@/lib/customers/retain'
import { formatAmount, formatDate } from '@/lib/format'
import { toCsv } from '@/lib/csv'
import { ExportCsvButton } from '../../finance/ExportCsvButton'

export const dynamic = 'force-dynamic'

type OrderRow = { customer_id: string | null; status: string; created_at: string; total: number | null; delivery_charge: number | null }
type CustomerRow = { id: string; name: string; phone: string | null; email: string | null; subscribed_to_marketing: boolean }

function currentTime(): Date {
  return new Date()
}

export default async function RetainCustomerPage({ searchParams }: { searchParams: Promise<{ days?: string; repeat?: string }> }) {
  await requireUser()
  const params = await searchParams
  const days = RETAIN_DAY_OPTIONS.includes(Number(params.days)) ? Number(params.days) : DEFAULT_RETAIN_DAYS
  const repeatOnly = params.repeat === '1'

  // The service role, because historical orders are hidden from browser clients
  // and those customers are the ones most worth winning back.
  const service = createServiceClient()
  const [orders, customers] = await Promise.all([
    fetchAllRows<OrderRow>(service, 'orders', 'id, customer_id, status:blanxer_status, created_at, total, delivery_charge', 'created_at'),
    fetchAllRows<CustomerRow>(service, 'customers', 'id, name, phone, email, subscribed_to_marketing', 'created_at'),
  ])

  const lapsed = lapsedCustomers(
    orders.map((o) => ({ customerId: o.customer_id, status: o.status, createdAt: o.created_at, total: o.total, deliveryCharge: o.delivery_charge })),
    customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, subscribed: c.subscribed_to_marketing })),
    currentTime(),
    days
  ).filter((c) => !repeatOnly || c.orders > 1)

  const csv = toCsv(
    ['Name', 'Phone', 'Email', 'Orders', 'Spent', 'Last order', 'Days since', 'Email marketing'],
    lapsed.map((c) => [
      c.name,
      c.phone ?? '',
      c.email ?? '',
      c.orders,
      c.spent,
      c.lastOrderAt.slice(0, 10),
      c.daysSince,
      c.subscribed ? 'Subscribed' : 'Unsubscribed',
    ])
  )

  return (
    <div className="page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Retain Customer</h1>
          <p className="text-sm text-muted">
            Customers who have bought before but not in the last {days} days, most valuable first. Contact them one at a time.
          </p>
        </div>
        <ExportCsvButton filename={`retain-customers-${days}-days.csv`} csv={csv} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">No order in</span>
        {RETAIN_DAY_OPTIONS.map((option) => (
          <Link
            key={option}
            href={`/customers/retain?days=${option}${repeatOnly ? '&repeat=1' : ''}`}
            className={option === days ? 'btn-gold' : 'btn-outline'}
          >
            {option} days
          </Link>
        ))}
        <Link
          href={`/customers/retain?days=${days}${repeatOnly ? '' : '&repeat=1'}`}
          className={repeatOnly ? 'btn-gold' : 'btn-outline'}
        >
          Repeat buyers only
        </Link>
      </div>

      {lapsed.length > 0 ? (
        <div className="table-shell overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Orders</th>
                <th>Spent</th>
                <th>Last order</th>
                <th>Email marketing</th>
              </tr>
            </thead>
            <tbody>
              {lapsed.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-ink">{c.name}</td>
                  <td className="whitespace-nowrap text-ink-soft">{c.phone ?? '—'}</td>
                  <td className="text-ink-soft">{c.email ?? '—'}</td>
                  <td className="tabular-nums text-ink-soft">{c.orders}</td>
                  <td className="tabular-nums text-ink-soft">{formatAmount(c.spent)}</td>
                  <td className="whitespace-nowrap text-ink-soft">
                    {formatDate(c.lastOrderAt)} <span className="text-muted">({c.daysSince} days)</span>
                  </td>
                  <td>
                    <span className={c.subscribed ? 'badge-success' : 'badge-neutral'}>
                      {c.subscribed ? 'Subscribed' : 'Unsubscribed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-ink-soft">No customers match.</p>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {lapsed.length.toLocaleString()} customers. Cancelled and returned orders don&rsquo;t count, and spending excludes delivery charges.
      </p>
    </div>
  )
}
