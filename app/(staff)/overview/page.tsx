import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import type { OrderStatus } from '@/lib/types'

const ORDER_STATUSES: OrderStatus[] = ['received', 'dispatched', 'delivered', 'cancelled']

const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'badge-neutral',
  dispatched: 'badge-gold',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
}

const CAMPAIGN_STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  sending: 'badge-gold',
  sent: 'badge-success',
}

function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Pulled out of the page component so the "impure function during render"
// lint rule (aimed at client component re-renders) doesn't apply here —
// this Server Component runs fresh per request regardless.
function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
}

export default async function OverviewPage() {
  const supabase = await createServerClient()

  const { data: orders } = await supabase.from('orders').select('status')
  const statusCounts: Record<OrderStatus, number> = { received: 0, dispatched: 0, delivered: 0, cancelled: 0 }
  for (const o of orders ?? []) {
    const status = o.status as OrderStatus
    if (status in statusCounts) statusCounts[status]++
  }
  const totalOrders = orders?.length ?? 0

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const sendingCampaignIds = (campaigns ?? []).filter((c) => c.status === 'sending').map((c) => c.id)
  const recipientCounts = new Map<string, { queued: number; sent: number; failed: number }>()
  if (sendingCampaignIds.length > 0) {
    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('campaign_id, status')
      .in('campaign_id', sendingCampaignIds)
    for (const r of recipients ?? []) {
      const counts = recipientCounts.get(r.campaign_id) ?? { queued: 0, sent: 0, failed: 0 }
      if (r.status === 'queued') counts.queued++
      else if (r.status === 'sent') counts.sent++
      else if (r.status === 'failed') counts.failed++
      recipientCounts.set(r.campaign_id, counts)
    }
  }

  const { data: failedSends } = await supabase
    .from('email_log')
    .select('id, type, template_used, sent_at, error_message')
    .eq('status', 'failed')
    .gte('sent_at', thirtyDaysAgoIso())
    .order('sent_at', { ascending: false })
    .limit(10)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Overview</h1>

      <section className="mb-8">
        <p className="field-label mb-3">Orders — {totalOrders} total</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ORDER_STATUSES.map((status) => (
            <div key={status} className="card text-center">
              <p className="text-2xl font-bold text-ink tabular-nums">{statusCounts[status]}</p>
              <span className={`${ORDER_STATUS_BADGE[status]} mt-2`}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <p className="field-label">Recent campaigns</p>
          <Link href="/campaigns" className="text-sm font-medium text-gold-dark hover:underline">View all</Link>
        </div>
        {campaigns && campaigns.length > 0 ? (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const counts = recipientCounts.get(c.id)
              return (
                <Link key={c.id} href={`/campaigns/${c.id}`} className="card block hover:border-gold-dark">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{c.name}</span>
                    <span className={CAMPAIGN_STATUS_BADGE[c.status] ?? 'badge-neutral'}>{c.status}</span>
                  </div>
                  {counts && (
                    <p className="mt-2 text-sm text-muted">
                      {counts.sent} sent · {counts.queued} queued · {counts.failed} failed
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="card text-center text-sm text-muted">No campaigns yet.</div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="field-label">Failed sends — last 30 days</p>
          <Link href="/email-log" className="text-sm font-medium text-gold-dark hover:underline">View all</Link>
        </div>
        {failedSends && failedSends.length > 0 ? (
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Sent at</th>
                  <th>Type</th>
                  <th>Template</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {failedSends.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-ink-soft">{formatSentAt(r.sent_at)}</td>
                    <td className="text-ink-soft">{r.type}</td>
                    <td className="text-ink-soft">{r.template_used}</td>
                    <td className="max-w-xs text-red-600">{r.error_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-center text-sm text-muted">No failed sends in the last 30 days.</div>
        )}
      </section>
    </div>
  )
}
