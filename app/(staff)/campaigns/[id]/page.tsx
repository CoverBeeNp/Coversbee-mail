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

  const [editing, setEditing] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editSegmentType, setEditSegmentType] = useState<'all_subscribed' | 'recent_customers'>('all_subscribed')
  const [editSegmentDays, setEditSegmentDays] = useState(30)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

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

  function startEdit() {
    if (!campaign) return
    setEditError(null)
    setEditSubject(campaign.subject)
    setEditBody(campaign.body_template)
    setEditSegmentType(campaign.segment_filter.type)
    setEditSegmentDays(campaign.segment_filter.type === 'recent_customers' ? campaign.segment_filter.days : 30)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditError(null)
  }

  async function saveEdit() {
    setSavingEdit(true)
    setEditError(null)
    const supabase = createBrowserClient()
    const segmentFilter: SegmentFilter =
      editSegmentType === 'recent_customers' ? { type: 'recent_customers', days: editSegmentDays } : { type: 'all_subscribed' }
    const { error } = await supabase
      .from('campaigns')
      .update({ subject: editSubject, body_template: editBody, segment_filter: segmentFilter })
      .eq('id', id)
    setSavingEdit(false)
    if (error) {
      setEditError(error.message)
      return
    }
    setEditing(false)
    await loadCampaign()
  }

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

  // While editing, the preview reflects the in-progress edit (not yet
  // saved) so staff can see the result before committing — that's the
  // whole point of editing next to a live preview instead of a separate
  // "edit then go look" round trip.
  const preview = editing
    ? renderCampaignEmail(editSubject, editBody)
    : renderCampaignEmail(campaign.subject, campaign.body_template)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted">{campaign.subject}</p>
        </div>
        <span className={STATUS_BADGE[campaign.status]}>{campaign.status}</span>
      </div>

      {editing ? (
        <div className="mb-6 card space-y-4">
          <p className="field-label">Edit draft</p>
          <div>
            <label htmlFor="edit-subject" className="field-label">Subject</label>
            <input id="edit-subject" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="field-input" />
          </div>
          <div>
            <label htmlFor="edit-body" className="field-label">Body HTML</label>
            <textarea
              id="edit-body"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={10}
              className="field-input font-mono text-xs leading-relaxed"
            />
          </div>
          <div>
            <label htmlFor="edit-segment" className="field-label">Audience</label>
            <select
              id="edit-segment"
              value={editSegmentType}
              onChange={(e) => setEditSegmentType(e.target.value as 'all_subscribed' | 'recent_customers')}
              className="field-input"
            >
              <option value="all_subscribed">All subscribed customers</option>
              <option value="recent_customers">Recent customers</option>
            </select>
          </div>
          {editSegmentType === 'recent_customers' && (
            <div>
              <label htmlFor="edit-segment-days" className="field-label">Within last N days</label>
              <input
                id="edit-segment-days"
                type="number"
                min={1}
                value={editSegmentDays}
                onChange={(e) => setEditSegmentDays(Number(e.target.value))}
                className="field-input"
              />
            </div>
          )}
          {editError && <p role="alert" className="alert-error">{editError}</p>}
          <div className="flex gap-2">
            <button disabled={savingEdit} onClick={saveEdit} className="btn-gold">
              {savingEdit ? 'Saving…' : 'Save changes'}
            </button>
            <button disabled={savingEdit} onClick={cancelEdit} className="btn-outline">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mb-6 card">
          <p className="field-label mb-1">Audience</p>
          <p className="text-sm text-ink-soft">
            {campaign.segment_filter.type === 'recent_customers'
              ? `Recent customers (last ${campaign.segment_filter.days} days)`
              : 'All subscribed customers'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {campaign.status === 'draft' && (
              <button onClick={startEdit} className="btn-outline">Edit draft</button>
            )}
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
      )}

      <div>
        <p className="field-label mb-1">Preview</p>
        <p className="mb-3 text-sm text-muted">
          {editing ? 'Updates live as you edit above.' : 'This is exactly what will be sent — subject and body wrapped in the branded shell.'}
        </p>
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
