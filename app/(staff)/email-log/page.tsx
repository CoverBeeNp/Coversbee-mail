'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

type EmailLogRow = {
  id: string
  sent_at: string
  type: 'transactional' | 'marketing'
  template_used: string
  status: 'sent' | 'failed'
  error_message: string | null
}

const PAGE_SIZE = 200

function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function EmailLogPage() {
  const [rows, setRows] = useState<EmailLogRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)

  async function load() {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from('email_log')
      .select('id, sent_at, type, template_used, status, error_message')
      .order('sent_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setRows((data ?? []) as EmailLogRow[])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, not a render-triggered sync
    load()
  }, [])

  async function retry(id: string) {
    setRetrying(id)
    await fetch('/api/email-log/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailLogId: id }),
    })
    setRetrying(null)
    await load()
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold text-ink">Send history</h1>
      <p className="mb-6 text-sm text-muted">Most recent {PAGE_SIZE} sends.</p>
      {loadError && <p role="alert" className="alert-error mb-4">{loadError}</p>}

      {rows.length > 0 ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Sent at</th>
                <th>Type</th>
                <th>Template</th>
                <th>Status</th>
                <th>Error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink-soft">{formatSentAt(r.sent_at)}</td>
                  <td className="text-ink-soft">{r.type}</td>
                  <td className="text-ink-soft">{r.template_used}</td>
                  <td>
                    <span className={r.status === 'sent' ? 'badge-success' : 'badge-danger'}>{r.status}</span>
                  </td>
                  <td className="max-w-xs text-red-600">{r.error_message}</td>
                  <td>
                    {r.status === 'failed' && r.type === 'transactional' && (
                      <button disabled={retrying === r.id} onClick={() => retry(r.id)} className="btn-outline">
                        {retrying === r.id ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-ink-soft">No emails sent yet.</p>
          <p className="mt-1 text-sm text-muted">Sends from orders and campaigns will show up here.</p>
        </div>
      )}
    </div>
  )
}
