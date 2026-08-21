'use client'
import { use, useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { SegmentFilter } from '@/lib/segments/resolveSegment'

type CampaignDetail = {
  id: string
  name: string
  subject: string
  body_template: string
  segment_filter: SegmentFilter
  status: 'draft' | 'sending' | 'sent'
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadCampaign() {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, name, subject, body_template, segment_filter, status')
      .eq('id', id)
      .single()
    if (error || !data) {
      setLoadError(error?.message ?? 'Campaign not found.')
      return
    }
    setLoadError(null)
    setCampaign(data as unknown as CampaignDetail)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, not a render-triggered sync
    loadCampaign()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id is stable for the life of this page
  }, [id])

  async function send(testMode: boolean) {
    setSending(true)
    setMessage(null)
    const res = await fetch('/api/campaigns/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: id, testMode }),
    })
    const body = await res.json()
    setMessage(body.ok ? `Queued ${body.queued} recipient(s).` : `Failed: ${body.error}`)
    setSending(false)
    if (body.ok) await loadCampaign()
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!campaign) return <p>Loading…</p>

  return (
    <div>
      <h1>{campaign.name}</h1>
      <p>Subject: {campaign.subject}</p>
      <p>Status: {campaign.status}</p>
      <p>
        Segment: {campaign.segment_filter.type === 'recent_customers'
          ? `Recent customers (last ${campaign.segment_filter.days} days)`
          : 'All subscribed customers'}
      </p>

      <div>
        <button disabled={sending} onClick={() => send(true)}>{sending ? 'Sending…' : 'Send test'}</button>
        <button disabled={sending} onClick={() => send(false)}>{sending ? 'Sending…' : 'Send to segment'}</button>
      </div>
      {message && <p>{message}</p>}
    </div>
  )
}
