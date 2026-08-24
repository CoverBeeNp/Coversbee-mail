import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { sendEmail } from '@/lib/zoho/client'
import { renderTransactionalEmail, renderCampaignEmail } from '@/lib/zoho/templates'
import type { OrderStatus } from '@/lib/types'

export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { emailLogId } = (await request.json()) as { emailLogId: string }
  const supabase = createServiceClient()

  const { data: logRow, error } = await supabase.from('email_log').select('*').eq('id', emailLogId).single()
  if (error || !logRow) return NextResponse.json({ ok: false, error: 'Log entry not found' }, { status: 404 })

  if (logRow.type === 'marketing') {
    return retryMarketing(supabase, logRow)
  }
  if (!logRow.order_id) {
    return NextResponse.json({ ok: false, error: 'Log entry has no associated order' }, { status: 400 })
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, parsed_items, total, address, tracking_url, customer_id, customers(name, email)')
    .eq('id', logRow.order_id)
    .single()
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })

  const customer = (order as unknown as { customers: { name: string | null; email: string | null } | null }).customers
  const { subject, html } = renderTransactionalEmail(logRow.template_used as OrderStatus, {
    blanxerOrderNumber: order.blanxer_order_number,
    items: (order.parsed_items ?? []) as never,
    total: order.total,
    customerName: customer?.name ?? null,
    address: order.address,
    trackingUrl: order.tracking_url,
    customerId: order.customer_id,
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

async function retryMarketing(
  supabase: ReturnType<typeof createServiceClient>,
  logRow: { customer_id: string; template_used: string }
) {
  const isTest = logRow.template_used.endsWith(' (test)')
  const campaignId = isTest ? logRow.template_used.replace(/ \(test\)$/, '') : logRow.template_used

  const { data: campaign } = await supabase.from('campaigns').select('subject, body_template').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 })

  if (!isTest) {
    // Real segment recipient — hand back to the throttled drain queue
    // (next hourly cron tick) instead of resending immediately. An
    // immediate resend is exactly the burst pattern that triggered Zoho's
    // "Unusual sending activity" block in the first place.
    const { data: updated, error: updateError } = await supabase
      .from('campaign_recipients')
      .update({ status: 'queued' })
      .eq('campaign_id', campaignId)
      .eq('customer_id', logRow.customer_id)
      .eq('status', 'failed')
      .select('campaign_id')
    if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ ok: false, error: 'Recipient is no longer in a failed state (already retried or sent)' }, { status: 409 })
    }
    await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)
    return NextResponse.json({ ok: true, requeued: true })
  }

  // Test sends bypass campaign_recipients entirely (see the comment in
  // app/api/campaigns/send/route.ts), so there's no queue row to requeue —
  // send it again directly, the same way the original test send did.
  const { data: customer } = await supabase.from('customers').select('email').eq('id', logRow.customer_id).single()
  const { subject, html } = renderCampaignEmail(campaign.subject, campaign.body_template, logRow.customer_id)
  try {
    if (!customer?.email) throw new Error('Customer has no email on file')
    const result = await sendEmail(supabase, { to: customer.email, subject, htmlBody: html })
    await supabase.from('email_log').insert({
      customer_id: logRow.customer_id, type: 'marketing', template_used: logRow.template_used, status: 'sent', zoho_message_id: result.messageId,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    await supabase.from('email_log').insert({
      customer_id: logRow.customer_id, type: 'marketing', template_used: logRow.template_used, status: 'failed', error_message: (err as Error).message,
    })
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }
}
