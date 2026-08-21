'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseOrder, saveOrder } from '../actions'
import type { ParsedOrder } from '@/lib/parser/blanxerParser'

const FIELD_LABELS: Record<'customerName' | 'customerEmail' | 'customerPhone' | 'city' | 'address', string> = {
  customerName: 'Customer name',
  customerEmail: 'Email',
  customerPhone: 'Phone',
  city: 'City',
  address: 'Address',
}

export default function NewOrderPage() {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParsedOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleParse() {
    setError(null)
    setParsing(true)
    try {
      setParsed(await parseOrder(rawText))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse order text.')
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    if (!parsed) return
    setError(null)
    setSaving(true)
    try {
      const { orderId } = await saveOrder({ rawPastedText: rawText, parsed })
      router.push(`/orders/${orderId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save order.')
      setSaving(false)
    }
  }

  function updateField<K extends keyof ParsedOrder>(key: K, value: ParsedOrder[K]) {
    if (!parsed) return
    setParsed({ ...parsed, [key]: value })
  }

  if (!parsed) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold text-ink">New order</h1>
        <p className="mb-6 text-sm text-muted">Paste the full text from the Blanxer order page below.</p>
        <div className="card space-y-4">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={16}
            placeholder="Paste the Blanxer order page text here…"
            className="field-input font-mono text-xs leading-relaxed"
          />
          {error && <p role="alert" className="alert-error">{error}</p>}
          <button onClick={handleParse} disabled={parsing || !rawText.trim()} className="btn-gold">
            {parsing ? 'Parsing…' : 'Parse'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">Confirm order details</h1>
      <p className="mb-6 text-sm text-muted">Review every field before saving — fields flagged &ldquo;needs review&rdquo; weren&rsquo;t confidently parsed.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map((field) => (
            <div key={field}>
              <label className="field-label flex items-center gap-2">
                {FIELD_LABELS[field]}
                {parsed.unmatchedFields.includes(field) && (
                  <span className="badge-danger">needs review</span>
                )}
              </label>
              <input
                value={parsed[field] ?? ''}
                onChange={(e) => updateField(field, e.target.value)}
                className="field-input"
              />
            </div>
          ))}

          <div>
            <span className="field-label flex items-center gap-2">
              Total
              {parsed.total == null && <span className="badge-danger">needs review</span>}
            </span>
            <p className="text-lg font-semibold text-ink tabular-nums">
              {parsed.total != null ? `रू ${parsed.total}` : '—'}
            </p>
          </div>

          <div>
            <span className="field-label">Items</span>
            <ul className="space-y-1 text-sm text-ink-soft">
              {parsed.items.map((item, i) => (
                <li key={i} className="flex justify-between">
                  <span>{item.name}{item.variant ? ` (${item.variant})` : ''} × {item.qty}</span>
                  <span className="tabular-nums">रू {item.lineTotal}</span>
                </li>
              ))}
            </ul>
          </div>

          {error && <p role="alert" className="alert-error">{error}</p>}
          <button onClick={handleSave} disabled={saving} className="btn-gold w-full">
            {saving ? 'Saving…' : 'Save order'}
          </button>
        </div>

        <div>
          <span className="field-label">Raw pasted text</span>
          <pre className="card whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-soft">{rawText}</pre>
        </div>
      </div>
    </div>
  )
}
