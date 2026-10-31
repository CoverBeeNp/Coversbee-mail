'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setBankBalance } from '@/lib/bankBalance/bankBalance'
import { formatAmount } from '@/lib/format'

export function BankBalanceCard({ amount }: { amount: number }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(amount))
  const [pending, setPending] = useState(false)

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await setBankBalance(Number(value))
      setEditing(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex items-end gap-2">
        <div>
          <label className="field-label" htmlFor="bankBalance">Current bank balance</label>
          <input
            id="bankBalance"
            type="number"
            step="0.01"
            className="field-input w-40"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-outline" onClick={() => { setEditing(false); setValue(String(amount)) }}>
          Cancel
        </button>
      </form>
    )
  }

  return (
    <div>
      <p className="text-sm text-muted">Current bank balance</p>
      <div className="mt-1 flex items-center gap-3">
        <p className="text-4xl font-bold tabular-nums text-ink">{formatAmount(amount)}</p>
        <button type="button" className="btn-outline px-2.5 py-1 text-xs" onClick={() => setEditing(true)}>
          Update
        </button>
      </div>
    </div>
  )
}
