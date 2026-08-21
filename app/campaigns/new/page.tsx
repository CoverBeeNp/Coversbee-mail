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
    <div>
      <h1>New campaign</h1>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" />
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="Body HTML" />
      <select value={segmentType} onChange={(e) => setSegmentType(e.target.value as 'all_subscribed' | 'recent_customers')}>
        <option value="all_subscribed">All subscribed customers</option>
        <option value="recent_customers">Recent customers (last 30 days)</option>
      </select>
      <button disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save draft'}</button>
      {saveError && <p role="alert">{saveError}</p>}
    </div>
  )
}
