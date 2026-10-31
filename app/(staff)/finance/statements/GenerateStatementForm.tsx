'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateStatement } from '@/lib/statements/statements'

function defaultMonth(): string {
  const now = new Date()
  // Default to last month, not the current (still in-progress) one — most
  // staff generate a statement for the month that just closed.
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function GenerateStatementForm() {
  const router = useRouter()
  const [month, setMonth] = useState(defaultMonth)
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [hasReturn, setHasReturn] = useState(false)
  const [returnAmount, setReturnAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await generateStatement(month, {
        openingBalance: Number(openingBalance),
        closingBalance: Number(closingBalance),
        returnAmount: hasReturn ? Number(returnAmount) : 0,
      })
      router.push(`/finance/statements/${month}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate this statement')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label" htmlFor="statementMonth">Month</label>
          <input
            id="statementMonth"
            type="month"
            className="field-input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="openingBalance">Starting bank balance (Rs)</label>
          <input
            id="openingBalance"
            type="number"
            step="0.01"
            className="field-input w-44"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="closingBalance">Ending bank balance (Rs)</label>
          <input
            id="closingBalance"
            type="number"
            step="0.01"
            className="field-input w-44"
            value={closingBalance}
            onChange={(e) => setClosingBalance(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="rounded-lg border border-line bg-paper p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={hasReturn}
            onChange={(e) => { setHasReturn(e.target.checked); if (!e.target.checked) setReturnAmount('') }}
          />
          Any offer or return this month?
        </label>
        {hasReturn && (
          <div className="mt-3">
            <label className="field-label" htmlFor="returnAmount">Return amount (Rs)</label>
            <input
              id="returnAmount"
              type="number"
              step="0.01"
              className="field-input w-44"
              value={returnAmount}
              onChange={(e) => setReturnAmount(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-muted">Counted as an expense for this statement, on top of what&apos;s already logged.</p>
          </div>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Generating…' : 'Generate statement'}
      </button>
      {error ? <p className="alert-error">{error}</p> : null}
    </form>
  )
}
