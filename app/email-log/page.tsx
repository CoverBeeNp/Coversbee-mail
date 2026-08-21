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
    <div>
      <h1>Send history</h1>
      <p>Most recent {PAGE_SIZE} sends.</p>
      {loadError && <p role="alert">{loadError}</p>}
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
              <td>{r.sent_at}</td>
              <td>{r.type}</td>
              <td>{r.template_used}</td>
              <td>{r.status}</td>
              <td>{r.error_message}</td>
              <td>
                {r.status === 'failed' && r.type === 'transactional' && (
                  <button disabled={retrying === r.id} onClick={() => retry(r.id)}>
                    {retrying === r.id ? 'Retrying…' : 'Retry'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
