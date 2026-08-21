import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { sendEmail } from '@/lib/zoho/client'
import { renderTransactionalEmail } from '@/lib/zoho/templates'
import type { OrderStatus } from '@/lib/types'

export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { emailLogId } = (await request.json()) as { emailLogId: string }
  const supabase = createServiceClient()

  const { data: logRow, error } = await supabase.from('email_log').select('*').eq('id', emailLogId).single()
  if (error || !logRow) return NextResponse.json({ ok: false, error: 'Log entry not found' }, { status: 404 })
  if (logRow.type !== 'transactional' || !logRow.order_id) {
    return NextResponse.json({ ok: false, error: 'Only transactional sends can be retried here; retry marketing sends by re-queuing the campaign' }, { status: 400 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, parsed_items, total, customer_id, customers(name, email)')
    .eq('id', logRow.order_id)
    .single()
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

  const customer = (order as unknown as { customers: { name: string | null; email: string | null } | null }).customers
  const { subject, html } = renderTransactionalEmail(logRow.template_used as OrderStatus, {
    blanxerOrderNumber: order.blanxer_order_number,
    items: (order.parsed_items ?? []) as never,
    total: order.total,
    customerName: customer?.name ?? null,
  })

  try {
    if (!customer?.email) throw new Error('Customer has no email on file')
    const result = await sendEmail(supabase, { to: customer.email, subject, htmlBody: html })
    await supabase.from('orders').update({ status: logRow.template_used, status_updated_at: new Date().toISOString() }).eq('id', order.id)
    await supabase.from('email_log').insert({
      order_id: order.id, customer_id: order.customer_id, type: 'transactional',
      template_used: logRow.template_used, status: 'sent', zoho_message_id: result.messageId,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    await supabase.from('email_log').insert({
      order_id: order.id, customer_id: order.customer_id, type: 'transactional',
      template_used: logRow.template_used, status: 'failed', error_message: (err as Error).message,
    })
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }
}
