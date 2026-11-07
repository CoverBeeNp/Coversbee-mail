'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Syncs on opening the page when the figures are stale, and on a click.
export function SyncInstagramButton({ stale }: { stale: boolean }) {
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
      const res = await fetch('/api/instagram/sync', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        setResult(body.error ?? 'Sync failed')
      } else {
        const left = body.daysRemaining + body.postsRemaining
        setResult(left > 0 ? 'Synced part of the history. The rest follows on the next sync.' : 'Up to date')
      }
      router.refresh()
    } catch {
      setResult('Sync failed')
    }
    running.current = false
    setSyncing(false)
  }, [router])

  useEffect(() => {
    if (!stale) return
    // After mount, and cancelled if the page is left straight away.
    const timer = window.setTimeout(() => void sync(), 0)
    return () => window.clearTimeout(timer)
  }, [stale, sync])

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={sync} disabled={syncing} className="btn-outline disabled:opacity-60">
        {syncing ? 'Syncing…' : 'Sync Instagram'}
      </button>
      {result && <p className="text-xs text-muted">{result}</p>}
    </div>
  )
}
