'use client'
import { use, useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { SegmentFilter } from '@/lib/segments/resolveSegment'
import { renderCampaignEmail } from '@/lib/zoho/templates'

type CampaignDetail = {
  id: string
  name: string
  subject: string
  body_template: string
  segment_filter: SegmentFilter
  status: 'draft' | 'sending' | 'sent'
}

const STATUS_BADGE: Record<CampaignDetail['status'], string> = {
  draft: 'badge-neutral',
  sending: 'badge-gold',
  sent: 'badge-success',
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

  if (loadError) return <div className="mx-auto max-w-3xl px-6 py-8"><p role="alert" className="alert-error">{loadError}</p></div>
  if (!campaign) return <div className="mx-auto max-w-3xl px-6 py-8"><p className="text-muted">Loading…</p></div>

  const preview = renderCampaignEmail(campaign.subject, campaign.body_template)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted">{campaign.subject}</p>
        </div>
        <span className={STATUS_BADGE[campaign.status]}>{campaign.status}</span>
      </div>

      <div className="mb-6 card">
        <p className="field-label mb-1">Audience</p>
        <p className="text-sm text-ink-soft">
          {campaign.segment_filter.type === 'recent_customers'
            ? `Recent customers (last ${campaign.segment_filter.days} days)`
            : 'All subscribed customers'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={sending} onClick={() => send(true)} className="btn-outline">
            {sending ? 'Sending…' : 'Send test'}
          </button>
          <button disabled={sending} onClick={() => send(false)} className="btn-gold">
            {sending ? 'Sending…' : 'Send to segment'}
          </button>
        </div>
        {message && (
          <p className={`mt-3 text-sm ${message.startsWith('Failed') ? 'text-red-600' : 'text-emerald-700'}`}>
            {message}
          </p>
        )}
      </div>

      <div>
        <p className="field-label mb-1">Preview</p>
        <p className="mb-3 text-sm text-muted">This is exactly what will be sent — subject and body wrapped in the branded shell.</p>
        <iframe
          title="Campaign email preview"
          srcDoc={preview.html}
          className="w-full max-w-[620px] rounded-2xl border border-line bg-white"
          style={{ height: 500 }}
        />
      </div>
    </div>
  )
}
