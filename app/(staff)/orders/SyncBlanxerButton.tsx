'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Lives in the sidebar, so it serves every page. Server-rendered pages update
// through router.refresh(); the orders list loads in the browser, so it listens
// for this event instead.
export const ORDERS_SYNCED_EVENT = 'coversbee:orders-synced'

export function SyncBlanxerButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function sync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/blanxer/sync-orders', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        setResult(body.error ?? 'Sync failed')
      } else {
        const updatedNote = body.updated ? `, re-checked ${body.updated}` : ''
        const errorNote = body.errors?.length ? `, ${body.errors.length} failed` : ''
        setResult(`Imported ${body.imported} new order${body.imported === 1 ? '' : 's'}${updatedNote}${errorNote}`)
        window.dispatchEvent(new Event(ORDERS_SYNCED_EVENT))
        router.refresh()
      }
    } catch {
      setResult('Sync failed')
    }
    setSyncing(false)
  }

  return (
    <div className="space-y-1">
      <button onClick={sync} disabled={syncing} className="btn-gold w-full">
        {syncing ? 'Syncing…' : 'Sync from Blanxer'}
      </button>
      {result && <p className="text-xs text-white/60">{result}</p>}
    </div>
  )
}
