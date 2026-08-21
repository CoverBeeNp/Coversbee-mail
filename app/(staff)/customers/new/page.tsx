'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

// Manual entry for customers who ordered before this app existed (their
// info living in Blanxer or some other pre-existing record) — deliberately
// a plain data-entry form with no send-email side effect anywhere in this
// path, unlike the order-paste flow which offers status-email buttons.
export default function NewCustomerPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

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
    <div className="mx-auto max-w-md px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">New customer</h1>
      <p className="mb-6 text-sm text-muted">
        For customers who ordered before this app was set up — no order or email is created, just the customer record.
      </p>
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
  )
}
