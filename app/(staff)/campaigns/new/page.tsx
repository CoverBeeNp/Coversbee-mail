'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export default function NewCampaignPage() {
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segmentType, setSegmentType] = useState<'all_subscribed' | 'recent_customers'>('all_subscribed')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const supabase = createBrowserClient()
    const segmentFilter = segmentType === 'recent_customers' ? { type: segmentType, days: 30 } : { type: segmentType }
    const { data, error } = await supabase
      .from('campaigns')
      .insert({ name, subject, body_template: body, segment_filter: segmentFilter })
      .select('id')
      .single()
    if (!error && data) {
      router.push(`/campaigns/${data.id}`)
      return
    }
    setSaveError(error?.message ?? 'Failed to save campaign')
    setSaving(false)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">New campaign</h1>
      <p className="mb-6 text-sm text-muted">You&rsquo;ll be able to preview and test-send before it goes to the segment.</p>
      <div className="card space-y-4">
        <div>
          <label className="field-label" htmlFor="name">Campaign name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="subject">Subject</label>
          <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="body">Body HTML</label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="<p>Write the campaign body…</p>"
            className="field-input font-mono text-xs leading-relaxed"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="segment">Audience</label>
          <select
            id="segment"
            value={segmentType}
            onChange={(e) => setSegmentType(e.target.value as 'all_subscribed' | 'recent_customers')}
            className="field-input"
          >
            <option value="all_subscribed">All subscribed customers</option>
            <option value="recent_customers">Recent customers (last 30 days)</option>
          </select>
        </div>
        {saveError && <p role="alert" className="alert-error">{saveError}</p>}
        <button disabled={saving} onClick={handleSave} className="btn-gold w-full">
          {saving ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </div>
  )
}
