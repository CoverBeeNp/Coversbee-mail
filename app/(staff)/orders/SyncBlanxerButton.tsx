'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Lives in the sidebar, so it serves every page. Server-rendered pages update
// through router.refresh(); the orders list loads in the browser, so it listens
// for this event instead.
export const ORDERS_SYNCED_EVENT = 'coversbee:orders-synced'

// Keeps the data matching Blanxer while anyone has the app open. Syncing is
// cheap when nothing has changed. The time is shared across tabs and pages.
const AUTO_SYNC_MS = 15 * 60 * 1000
const LAST_AUTO_SYNC_KEY = 'coversbee:last-auto-sync'

export function SyncBlanxerButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const running = useRef(false)

  const sync = useCallback(async () => {
    if (running.current) return
    running.current = true
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/blanxer/sync-orders', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        setResult(body.error ?? 'Sync failed')
      } else {
        const parts = [`${body.imported} new`, `${body.updated} updated`]
        if (body.remaining) parts.push(`${body.remaining} still to do`)
        if (body.errors?.length) parts.push(`${body.errors.length} failed`)
        setResult(parts.join(', '))
        window.dispatchEvent(new Event(ORDERS_SYNCED_EVENT))
        router.refresh()
      }
    } catch {
      setResult('Sync failed')
    }
    running.current = false
    setSyncing(false)
  }, [router])

  useEffect(() => {
    function syncIfDue() {
      const last = Number(window.localStorage.getItem(LAST_AUTO_SYNC_KEY) ?? 0)
      if (Date.now() - last < AUTO_SYNC_MS) return
      window.localStorage.setItem(LAST_AUTO_SYNC_KEY, String(Date.now()))
      void sync()
    }
    syncIfDue()
    const timer = window.setInterval(syncIfDue, 60 * 1000)
    return () => window.clearInterval(timer)
  }, [sync])

  return (
    <div className="space-y-1">
      <button onClick={sync} disabled={syncing} className="btn-gold w-full">
        {syncing ? 'Syncing…' : 'Sync from Blanxer'}
      </button>
      {result && <p className="text-xs text-white/60">{result}</p>}
    </div>
  )
}
