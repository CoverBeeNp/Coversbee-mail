'use client'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/client'
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, blanxerStatusLabel, type OrderStatus } from '@/lib/types'
import { formatAmount } from '@/lib/format'
import { cleanSearchText, customerSearchFilter, orderSearchFilter } from '@/lib/orders/orderSearch'
import { UNSENT_EMAIL_DAYS, loadOrdersMissingEmail } from '@/lib/orders/unsentEmails'
import { ORDERS_SYNCED_EVENT } from './SyncBlanxerButton'

const ORDER_LIMIT = 50
// A search or filter looks through every tracked order, so it can return more.
const MATCH_LIMIT = 200
const CUSTOMER_MATCH_LIMIT = 100
const SEARCH_DELAY_MS = 300

const ORDER_STATUSES: OrderStatus[] = ['received', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled']

type Order = {
  id: string
  blanxer_order_number: string | null
  status: OrderStatus
  blanxer_status: string | null
  total: number | null
  customers: { name: string | null } | { name: string | null }[] | null
}

function customerName(order: Order): string | null {
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  return customer?.name ?? null
}

export default function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; email?: string }> }) {
  const params = use(searchParams)
  const requestedStatus = params.status as OrderStatus | undefined
  const [orders, setOrders] = useState<Order[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>(
    requestedStatus && ORDER_STATUSES.includes(requestedStatus) ? requestedStatus : 'all'
  )
  const [unsentOnly, setUnsentOnly] = useState(params.email === 'unsent')

  // Typing fires several loads. Only the latest one may update the list.
  const latestLoad = useRef(0)

  const load = useCallback(async () => {
    const loadId = ++latestLoad.current
    const supabase = createBrowserClient()
    const text = cleanSearchText(search)
    try {
      let query = supabase
        .from('orders')
        .select('id, blanxer_order_number, status, blanxer_status, total, customers(name)')
        // Null status means not in the email workflow: historical and non-Blanxer
        // orders, which live on the finance pages.
        .not('status', 'is', null)
        .order('created_at', { ascending: false })
      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (unsentOnly) query = query.in('id', await loadOrdersMissingEmail(supabase, new Date()))
      if (text) {
        const { data: customers, error } = await supabase
          .from('customers')
          .select('id')
          .or(customerSearchFilter(text))
          .limit(CUSTOMER_MATCH_LIMIT)
        if (error) throw new Error(error.message)
        query = query.or(orderSearchFilter(text, (customers ?? []).map((c) => c.id)))
      }
      const filtering = text || statusFilter !== 'all' || unsentOnly
      const { data, error } = await query.limit(filtering ? MATCH_LIMIT : ORDER_LIMIT)
      if (error) throw new Error(error.message)
      if (loadId !== latestLoad.current) return
      setLoadError(null)
      setOrders((data ?? []) as unknown as Order[])
    } catch (err) {
      if (loadId !== latestLoad.current) return
      setLoadError((err as Error).message)
    }
    setLoaded(true)
  }, [search, statusFilter, unsentOnly])

  useEffect(() => {
    const timer = window.setTimeout(load, SEARCH_DELAY_MS)
    window.addEventListener(ORDERS_SYNCED_EVENT, load)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(ORDERS_SYNCED_EVENT, load)
    }
  }, [load])

  const filtering = search.trim() !== '' || statusFilter !== 'all' || unsentOnly

  return (
    <div className="page">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Orders</h1>
          <p className="text-sm text-muted">
            {filtering
              ? `Searching all orders, showing up to ${MATCH_LIMIT}.`
              : `The latest ${ORDER_LIMIT} orders. Search to find older ones. Open an order to send its next status email.`}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order number, customer name, phone or email"
          className="field-input w-80"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
          className="field-input w-40"
        >
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-soft" title={`Orders from the last ${UNSENT_EMAIL_DAYS} days whose customer hasn't had the email for the current status. Received isn't counted`}>
          <input type="checkbox" checked={unsentOnly} onChange={(e) => setUnsentOnly(e.target.checked)} />
          Email not sent
        </label>
      </div>

      {loadError && <p role="alert" className="alert-error mb-4">{loadError}</p>}

      {orders.length > 0 ? (
        <div className="table-shell">
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
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:text-gold-dark">
                      #{o.blanxer_order_number}
                    </Link>
                  </td>
                  <td className="text-ink-soft">{customerName(o) ?? '—'}</td>
                  <td><span className={ORDER_STATUS_BADGE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</span></td>
                  <td className="text-ink-soft">{blanxerStatusLabel(o.blanxer_status)}</td>
                  <td className="tabular-nums text-ink-soft">{o.total != null ? formatAmount(o.total) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          {!loaded ? (
            <p className="text-ink-soft">Loading…</p>
          ) : filtering ? (
            <p className="text-ink-soft">{unsentOnly && !search.trim() ? 'Every recent order has had its status email.' : 'No orders match.'}</p>
          ) : (
            <>
              <p className="text-ink-soft">No orders yet.</p>
              <p className="mt-1 text-sm text-muted">Use Sync from Blanxer to start tracking orders here.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
