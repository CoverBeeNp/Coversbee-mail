import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  sending: 'badge-gold',
  sent: 'badge-success',
}

export default async function CampaignsPage() {
  const supabase = await createServerClient()
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, status, created_at').order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Campaigns</h1>
          <p className="text-sm text-muted">Draft, preview, and send marketing emails.</p>
        </div>
        <Link href="/campaigns/new" className="btn-gold">+ New campaign</Link>
      </div>

      {campaigns && campaigns.length > 0 ? (
        <div className="table-shell">
          <table>
            <thead>
              <tr><th>Name</th><th>Status</th></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/campaigns/${c.id}`} className="font-semibold text-ink hover:text-gold-dark">
                      {c.name}
                    </Link>
                  </td>
                  <td><span className={STATUS_BADGE[c.status] ?? 'badge-neutral'}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-ink-soft">No campaigns yet.</p>
          <p className="mt-1 text-sm text-muted">Draft your first campaign and preview it before sending.</p>
          <Link href="/campaigns/new" className="btn-gold mt-4 inline-flex">+ New campaign</Link>
        </div>
      )}
    </div>
  )
}
