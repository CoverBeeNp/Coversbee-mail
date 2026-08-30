'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/client'
import type { OrderStatus } from '@/lib/types'
import { SyncBlanxerButton } from './SyncBlanxerButton'

const STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'badge-neutral',
  dispatched: 'badge-gold',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
}

const ORDER_STATUSES: OrderStatus[] = ['received', 'dispatched', 'delivered', 'cancelled']

type Order = {
  id: string
  blanxer_order_number: string | null
  status: OrderStatus
  total: number | null
  customers: { name: string | null } | { name: string | null }[] | null
}

function customerName(order: Order): string | null {
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  return customer?.name ?? null
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

  async function load() {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('orders')
      .select('id, blanxer_order_number, status, total, customers(name)')
      .order('created_at', { ascending: false })
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setOrders((data ?? []) as unknown as Order[])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, not a render-triggered sync
    load()
  }, [])

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (o.blanxer_order_number ?? '').toLowerCase().includes(q) ||
      (customerName(o) ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Orders</h1>
          <p className="text-sm text-muted">Paste an order from Blanxer to get started.</p>
        </div>
        <div className="flex items-start gap-3">
          <SyncBlanxerButton onSynced={load} />
          <Link href="/orders/new" className="btn-gold">+ New order</Link>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order number or customer"
          className="field-input w-72"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
          className="field-input w-40"
        >
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loadError && <p role="alert" className="alert-error mb-4">{loadError}</p>}

      {filtered.length > 0 ? (
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
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:text-gold-dark">
                      #{o.blanxer_order_number}
                    </Link>
                  </td>
                  <td className="text-ink-soft">{customerName(o) ?? '—'}</td>
                  <td><span className={STATUS_BADGE[o.status]}>{o.status}</span></td>
                  <td className="tabular-nums text-ink-soft">{o.total != null ? `रू ${o.total}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          {orders.length > 0 ? (
            <p className="text-ink-soft">No orders match your search.</p>
          ) : (
            <>
              <p className="text-ink-soft">No orders yet.</p>
              <p className="mt-1 text-sm text-muted">Paste your first Blanxer order to start tracking it here.</p>
              <Link href="/orders/new" className="btn-gold mt-4 inline-flex">+ New order</Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
