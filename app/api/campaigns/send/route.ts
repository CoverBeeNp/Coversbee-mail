import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSegmentCustomerIds, type SegmentFilter } from '@/lib/segments/resolveSegment'

export async function POST(request: NextRequest) {
  const { campaignId, testMode } = (await request.json()) as { campaignId: string; testMode: boolean }
  const supabase = createServiceClient()

  const { data: campaign, error } = await supabase.from('campaigns').select('id, segment_filter').eq('id', campaignId).single()
  if (error || !campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 })

  let customerIds: string[]
  if (testMode) {
    const { data: testEmails } = await supabase.from('test_recipients').select('email')
    const { data: matchingCustomers } = await supabase.from('customers').select('id').in('email', (testEmails ?? []).map((r) => r.email))
    customerIds = (matchingCustomers ?? []).map((c) => c.id)
  } else {
    customerIds = await resolveSegmentCustomerIds(supabase, campaign.segment_filter as SegmentFilter)
  }

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
