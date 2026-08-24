import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/lib/types'
import { SyncBlanxerButton } from './SyncBlanxerButton'

const STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'badge-neutral',
  dispatched: 'badge-gold',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
}

export default async function OrdersPage() {
  const supabase = await createServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, status, total, customers(name)')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Orders</h1>
          <p className="text-sm text-muted">Paste an order from Blanxer to get started.</p>
        </div>
        <div className="flex items-start gap-3">
          <SyncBlanxerButton />
          <Link href="/orders/new" className="btn-gold">+ New order</Link>
        </div>
      </div>

      {orders && orders.length > 0 ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const customer = o.customers as unknown as { name: string | null } | null
                return (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:text-gold-dark">
                        #{o.blanxer_order_number}
                      </Link>
                    </td>
                    <td className="text-ink-soft">{customer?.name ?? '—'}</td>
                    <td><span className={STATUS_BADGE[o.status as OrderStatus]}>{o.status}</span></td>
                    <td className="tabular-nums text-ink-soft">{o.total != null ? `रू ${o.total}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-ink-soft">No orders yet.</p>
          <p className="mt-1 text-sm text-muted">Paste your first Blanxer order to start tracking it here.</p>
          <Link href="/orders/new" className="btn-gold mt-4 inline-flex">+ New order</Link>
        </div>
      )}
    </div>
  )
}
