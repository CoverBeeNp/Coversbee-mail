'use client'
import { use, useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { ParsedItem } from '@/lib/parser/blanxerParser'
import type { OrderStatus } from '@/lib/types'

const STATUSES: OrderStatus[] = ['received', 'dispatched', 'delivered', 'cancelled']

type OrderDetail = {
  id: string
  blanxer_order_number: string | null
  status: OrderStatus
  total: number | null
  parsed_items: ParsedItem[]
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

  if (loadError) return <p role="alert">{loadError}</p>
  if (!order) return <p>Loading…</p>

  return (
    <div>
      <h1>Order #{order.blanxer_order_number}</h1>
      <p>Customer: {order.customers?.name} ({order.customers?.email ?? 'no email on file'})</p>
      <p>Status: {order.status}</p>
      <ul>
        {order.parsed_items.map((item, i) => (
          <li key={i}>{item.name}{item.variant ? ` (${item.variant})` : ''} x{item.qty} — रू {item.lineTotal}</li>
        ))}
      </ul>
      <p>Total: रू {order.total ?? ''}</p>

      <div>
        {STATUSES.map((status) => (
          <button key={status} disabled={sending !== null} onClick={() => sendStatus(status)}>
            {sending === status ? 'Sending…' : `Send ${status[0].toUpperCase()}${status.slice(1)}`}
          </button>
        ))}
      </div>
      {message && <p>{message}</p>}
    </div>
  )
}
