'use client'
import { use, useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { ORDER_STATUS_LABEL, itemVariantLabel, type OrderItem, type OrderStatus } from '@/lib/types'

const STATUSES: OrderStatus[] = ['received', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled']

const STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'badge-neutral',
  dispatched: 'badge-gold',
  out_for_delivery: 'badge-gold',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
}

type OrderDetail = {
  id: string
  blanxer_order_number: string | null
  status: OrderStatus | null
  total: number | null
  parsed_items: OrderItem[]
  customers: { name: string | null; email: string | null } | null
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sending, setSending] = useState<OrderStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function loadOrder() {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('orders')
      .select('id, blanxer_order_number, status, total, parsed_items, customers(name, email)')
      .eq('id', id)
      .single()
    if (error || !data) {
      setLoadError(error?.message ?? 'Order not found.')
      return
    }
    setLoadError(null)
    setOrder(data as unknown as OrderDetail)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, not a render-triggered sync
    loadOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id is stable for the life of this page
  }, [id])

  async function sendStatus(status: OrderStatus) {
    setSending(status)
    setMessage(null)
    const res = await fetch('/api/send-transactional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: id, status }),
    })
    const body = await res.json()
    setMessage(body.ok ? `Sent "${status}" email.` : `Failed: ${body.error}`)
    setSending(null)
    if (body.ok) await loadOrder()
  }

  if (loadError) return <div className="mx-auto max-w-3xl px-6 py-8"><p role="alert" className="alert-error">{loadError}</p></div>
  if (!order) return <div className="mx-auto max-w-3xl px-6 py-8"><p className="text-muted">Loading…</p></div>

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Order #{order.blanxer_order_number}</h1>
          <p className="mt-1 text-sm text-muted">
            {order.customers?.name ?? 'Unknown customer'} · {order.customers?.email ?? 'no email on file'}
          </p>
        </div>
        {order.status && <span className={STATUS_BADGE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</span>}
      </div>

      <div className="card mb-6">
        <ul className="divide-y divide-line">
          {order.parsed_items.map((item, i) => {
            const variant = itemVariantLabel(item)
            return (
            <li key={i} className="flex justify-between py-2 text-sm">
              <span className="text-ink-soft">{item.name}{variant ? ` (${variant})` : ''} × {item.qty}</span>
              <span className="tabular-nums text-ink">रू {item.lineTotal}</span>
            </li>
            )
          })}
        </ul>
        <div className="mt-3 flex justify-between border-t border-line pt-3">
          <span className="font-semibold text-ink">Total</span>
          <span className="font-semibold tabular-nums text-ink">रू {order.total ?? '—'}</span>
        </div>
      </div>

      <div className="card">
        <p className="field-label mb-3">Send status email</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              disabled={sending !== null}
              onClick={() => sendStatus(status)}
              className={status === order.status ? 'btn-outline' : 'btn-primary'}
            >
              {sending === status ? 'Sending…' : `Send ${ORDER_STATUS_LABEL[status]}`}
            </button>
          ))}
        </div>
        {message && (
          <p className={`mt-3 text-sm ${message.startsWith('Failed') ? 'text-red-600' : 'text-emerald-700'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
