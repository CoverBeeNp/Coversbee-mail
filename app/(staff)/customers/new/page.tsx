'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { parseCustomerDetails } from '@/lib/parser/blanxerParser'

// Manual entry for customers who ordered before this app existed (their
// info living in Blanxer or some other pre-existing record) — deliberately
// a plain data-entry form with no send-email side effect anywhere in this
// path, unlike the order-paste flow which offers status-email buttons.
export default function NewCustomerPage() {
  const [pasteText, setPasteText] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleParse() {
    const parsed = parseCustomerDetails(pasteText)
    // Fill in whatever the paste found; never clobber a field the paste
    // couldn't confidently extract — the fields stay directly editable
    // either way, matching the order-paste flow's "never guess" rule.
    if (parsed.name) setName(parsed.name)
    if (parsed.phone) setPhone(parsed.phone)
    if (parsed.email) setEmail(parsed.email)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const supabase = createBrowserClient()

    // Two separate .eq() lookups rather than a hand-built .or() filter
    // string, so a phone/email value with a comma or period (which have
    // syntactic meaning in PostgREST's or() filter syntax) can't be
    // misparsed.
    if (phone) {
      const { data: existing } = await supabase.from('customers').select('id, name').eq('phone', phone).limit(1)
      if (existing && existing.length > 0) {
        setSaving(false)
        setError(`A customer with this phone already exists (${existing[0].name}) — edit them from the Customers list instead of adding a duplicate.`)
        return
      }
    }
    if (email) {
      const { data: existing } = await supabase.from('customers').select('id, name').eq('email', email).limit(1)
      if (existing && existing.length > 0) {
        setSaving(false)
        setError(`A customer with this email already exists (${existing[0].name}) — edit them from the Customers list instead of adding a duplicate.`)
        return
      }
    }

    const { error: insertError } = await supabase.from('customers').insert({
      name,
      phone: phone || null,
      email: email || null,
      subscribed_to_marketing: subscribed,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    router.push('/customers')
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">New customer</h1>
      <p className="mb-6 text-sm text-muted">
        For customers who ordered before this app was set up — no order or email is created, just the customer record.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <p className="field-label">Paste customer details (optional)</p>
          <p className="text-sm text-muted">
            Paste the &ldquo;Customer Details&rdquo; block from Blanxer&rsquo;s order page — this only fills in the fields
            on the right, it doesn&rsquo;t save anything by itself.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={12}
            placeholder={'Customer Details\n\nName:\n\nNees shah\n\nEmail:\n\ngrgbini898@gmail.com\n\nPhone Number:\n\n9709956477'}
            className="field-input font-mono text-xs leading-relaxed"
          />
          <button type="button" onClick={handleParse} disabled={!pasteText.trim()} className="btn-outline">
            Fill in fields from paste
          </button>
        </div>

        <form onSubmit={handleSave} className="card space-y-4">
          <div>
            <label htmlFor="name" className="field-label">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="field-input" required />
          </div>
          <div>
            <label htmlFor="phone" className="field-label">Phone</label>
            <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input" />
          </div>
          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={subscribed} onChange={(e) => setSubscribed(e.target.checked)} />
            Subscribed to marketing emails
          </label>
          {error && <p role="alert" className="alert-error">{error}</p>}
          <button type="submit" disabled={saving} className="btn-gold w-full">
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </form>
      </div>
    </div>
  )
}
