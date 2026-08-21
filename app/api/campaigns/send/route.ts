import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { resolveSegmentCustomerIds, type SegmentFilter } from '@/lib/segments/resolveSegment'
import { sendEmail } from '@/lib/zoho/client'
import { renderCampaignEmail } from '@/lib/zoho/templates'

export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { campaignId, testMode } = (await request.json()) as { campaignId: string; testMode: boolean }
  const supabase = createServiceClient()

  const { data: campaign, error } = await supabase.from('campaigns').select('id, subject, body_template, segment_filter').eq('id', campaignId).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 })

  // Test-mode sends are handled entirely outside campaign_recipients: they
  // never touch the throttled-drain queue that Task 7's real "Send to
  // segment" path and the Edge Function drain function operate on. This
  // avoids two failure modes that a shared-queue design would have: (1) a
  // staff test address that happens to belong to a real customer getting
  // permanently excluded from the real send via the alreadySent check below,
  // and (2) a campaign's status flipping to 'sent' from the drain's "no
  // queued rows remain" sweep after only a test went out. Test recipient
  // lists are always small and fixed, so sending them synchronously here
  // (no throttling) is safe and simpler than adding an is_test column.
  if (testMode) {
    const { data: testEmails } = await supabase.from('test_recipients').select('email')
    const emails = (testEmails ?? []).map((r) => r.email)
    if (emails.length === 0) return NextResponse.json({ ok: false, error: 'No test recipients configured' }, { status: 400 })

    // email_log.customer_id is NOT NULL, so (as before this fix) a test
    // recipient email only gets a logged send if it matches an existing
    // customer record; the send itself is attempted regardless.
    const { data: matchingCustomers } = await supabase.from('customers').select('id, email').in('email', emails)
    const customerIdByEmail = new Map((matchingCustomers ?? []).map((c) => [c.email, c.id]))

    let sent = 0
    const errors: string[] = []
    for (let i = 0; i < emails.length; i++) {
      const to = emails[i]
      const matchedCustomerId = customerIdByEmail.get(to)
      // Rendered per-recipient (rather than once, reused) because the
      // unsubscribe link is customer-specific.
      const { subject, html } = renderCampaignEmail(campaign.subject, campaign.body_template, matchedCustomerId)
      try {
        const result = await sendEmail(supabase, { to, subject, htmlBody: html })
        if (matchedCustomerId) {
          await supabase.from('email_log').insert({
            customer_id: matchedCustomerId, type: 'marketing', template_used: `${campaignId} (test)`, status: 'sent', zoho_message_id: result.messageId,
          })
        }
        sent++
      } catch (err) {
        errors.push((err as Error).message)
        if (matchedCustomerId) {
          await supabase.from('email_log').insert({
            customer_id: matchedCustomerId, type: 'marketing', template_used: `${campaignId} (test)`, status: 'failed', error_message: (err as Error).message,
          })
        }
      }
      // Zoho's usage policy explicitly does not support burst sending
      // regardless of staying under the hourly cap — a tight loop of API
      // calls with no spacing looks like exactly that, and triggered a real
      // "550 5.4.6 Unusual sending activity" block during testing. A small
      // gap between sends (skipped after the last recipient) keeps this
      // from reading as a burst even for a small test list.
      if (i < emails.length - 1) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (sent === 0) return NextResponse.json({ ok: false, error: errors[0] ?? 'Test send failed' }, { status: 502 })
    return NextResponse.json({ ok: true, queued: sent })
  }

  const customerIds = await resolveSegmentCustomerIds(supabase, campaign.segment_filter as SegmentFilter)

  if (customerIds.length === 0) return NextResponse.json({ ok: false, error: 'No recipients matched' }, { status: 400 })

  // Don't let a re-send (e.g. clicking "Send test" twice, or a second "Send to
  // segment" after Task 8's drain has already marked some recipients 'sent')
  // revert an already-sent row back to 'queued'. Only upsert customers who are
  // new to this campaign or still queued/failed.
  const { data: alreadySent, error: alreadySentError } = await supabase
    .from('campaign_recipients')
    .select('customer_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')
    .in('customer_id', customerIds)
  if (alreadySentError) {
    return NextResponse.json({ ok: false, error: alreadySentError.message }, { status: 500 })
  }
  const alreadySentIds = new Set((alreadySent ?? []).map((r) => r.customer_id))
  const toQueueIds = customerIds.filter((id) => !alreadySentIds.has(id))

  if (toQueueIds.length > 0) {
    // Upsert (not insert) so re-sending doesn't crash on the (campaign_id,
    // customer_id) primary key instead of just re-queuing.
    const { error: upsertError } = await supabase
      .from('campaign_recipients')
      .upsert(
        toQueueIds.map((customerId) => ({ campaign_id: campaignId, customer_id: customerId, status: 'queued' })),
        { onConflict: 'campaign_id,customer_id' }
      )
    if (upsertError) {
      return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 })
    }
  }

  const { error: statusError } = await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)
  if (statusError) {
    return NextResponse.json({ ok: false, error: statusError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, queued: toQueueIds.length })
}
