'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
        const errorNote = body.errors?.length ? `, ${body.errors.length} failed` : ''
        setResult(`Imported ${body.imported} new order${body.imported === 1 ? '' : 's'}${errorNote}`)
        router.refresh()
      }
    } catch {
      setResult('Sync failed')
    }
    setSyncing(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={sync} disabled={syncing} className="btn-outline">
        {syncing ? 'Syncing…' : 'Sync from Blanxer'}
      </button>
      {result && <p className="text-xs text-muted">{result}</p>}
    </div>
  )
}
