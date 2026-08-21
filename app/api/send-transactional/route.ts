import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { sendEmail } from '@/lib/zoho/client'
import { renderTransactionalEmail } from '@/lib/zoho/templates'
import type { OrderStatus } from '@/lib/types'

const VALID_STATUSES: OrderStatus[] = ['received', 'dispatched', 'delivered', 'cancelled']

export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId, status } = (await request.json()) as { orderId: string; status: OrderStatus }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ ok: false, error: `Invalid status "${status}"` }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, parsed_items, total, customer_id, customers(name, email)')
    .eq('id', orderId)
    .single()
  if (error || !order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

  const customer = (order as unknown as { customers: { name: string | null; email: string | null } | null }).customers

  try {
    const { subject, html } = renderTransactionalEmail(status, {
      blanxerOrderNumber: order.blanxer_order_number,
      items: (order.parsed_items ?? []) as never,
      total: order.total,
      customerName: customer?.name ?? null,
    })
    if (!customer?.email) throw new Error('Customer has no email on file')
    const result = await sendEmail(supabase, { to: customer.email, subject, htmlBody: html })
    await supabase.from('orders').update({ status, status_updated_at: new Date().toISOString() }).eq('id', orderId)
    await supabase.from('email_log').insert({
      order_id: orderId, customer_id: order.customer_id, type: 'transactional',
      template_used: status, status: 'sent', zoho_message_id: result.messageId,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    await supabase.from('email_log').insert({
      order_id: orderId, customer_id: order.customer_id, type: 'transactional',
      template_used: status, status: 'failed', error_message: (err as Error).message,
    })
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }
}
