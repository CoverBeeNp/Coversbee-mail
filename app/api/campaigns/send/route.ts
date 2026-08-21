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

  // Upsert (not insert) so re-sending — e.g. clicking "Send test" twice — doesn't
  // crash on the (campaign_id, customer_id) primary key instead of just re-queuing.
  await supabase
    .from('campaign_recipients')
    .upsert(
      customerIds.map((customerId) => ({ campaign_id: campaignId, customer_id: customerId, status: 'queued' })),
      { onConflict: 'campaign_id,customer_id' }
    )
  await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)

  return NextResponse.json({ ok: true, queued: customerIds.length })
}
