'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  name: string
  phone: string | null
  email: string | null
  subscribed_to_marketing: boolean
}

type EditableFields = Pick<Customer, 'name' | 'phone' | 'email' | 'subscribed_to_marketing'>

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditableFields | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function load() {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, email, subscribed_to_marketing')
      .order('created_at', { ascending: false })
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setCustomers((data ?? []) as Customer[])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, not a render-triggered sync
    load()
  }, [])

  function startEdit(customer: Customer) {
    setEditingId(customer.id)
    setSaveError(null)
    setDraft({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      subscribed_to_marketing: customer.subscribed_to_marketing,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
    setSaveError(null)
  }

  async function saveEdit(id: string) {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    const supabase = createBrowserClient()
    const { error } = await supabase.from('customers').update(draft).eq('id', id)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setEditingId(null)
    setDraft(null)
    await load()
  }

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Customers</h1>
          <p className="text-sm text-muted">Fix a typo&rsquo;d email or phone, or update marketing subscription.</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email"
          className="field-input w-64"
        />
      </div>

      {loadError && <p role="alert" className="alert-error mb-4">{loadError}</p>}

      {filtered.length > 0 ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Marketing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isEditing = editingId === c.id
                return (
                  <tr key={c.id}>
                    {isEditing && draft ? (
                      <>
                        <td>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            className="field-input"
                          />
                        </td>
                        <td>
                          <input
                            value={draft.phone ?? ''}
                            onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
                            className="field-input"
                          />
                        </td>
                        <td>
                          <input
                            value={draft.email ?? ''}
                            onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
                            className="field-input"
                          />
                        </td>
                        <td>
                          <label className="flex items-center gap-2 text-sm text-ink-soft">
                            <input
                              type="checkbox"
                              checked={draft.subscribed_to_marketing}
                              onChange={(e) => setDraft({ ...draft, subscribed_to_marketing: e.target.checked })}
                            />
                            Subscribed
                          </label>
                        </td>
                        <td>
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <button disabled={saving} onClick={() => saveEdit(c.id)} className="btn-gold">
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              <button disabled={saving} onClick={cancelEdit} className="btn-outline">Cancel</button>
                            </div>
                            {saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="font-medium text-ink">{c.name}</td>
                        <td className="text-ink-soft">{c.phone ?? '—'}</td>
                        <td className="text-ink-soft">{c.email ?? '—'}</td>
                        <td>
                          <span className={c.subscribed_to_marketing ? 'badge-success' : 'badge-neutral'}>
                            {c.subscribed_to_marketing ? 'Subscribed' : 'Unsubscribed'}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => startEdit(c)} className="btn-outline">Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-ink-soft">{search ? 'No customers match your search.' : 'No customers yet.'}</p>
          <p className="mt-1 text-sm text-muted">Customers are created automatically when you save an order.</p>
        </div>
      )}
    </div>
  )
}
