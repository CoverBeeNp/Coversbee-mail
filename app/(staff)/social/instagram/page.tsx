import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createServiceClient } from '@/lib/supabase/server'
import { instagramConfig } from '@/lib/instagram/config'
import { addDays, nepalDay } from '@/lib/instagram/days'
import {
  DEFAULT_INSTAGRAM_RANGE,
  INSTAGRAM_RANGE_OPTIONS,
  instagramSummary,
  postKind,
  type DailyRow,
  type MediaRow,
  type OrderRow,
} from '@/lib/instagram/summary'
import { formatDate } from '@/lib/format'
import { StatTile } from '../../StatTile'
import { InstagramCharts } from './InstagramCharts'
import { SyncInstagramButton } from './SyncInstagramButton'

export const dynamic = 'force-dynamic'

const STALE_AFTER_MS = 6 * 60 * 60 * 1000
const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000

const ERRORS: Record<string, string> = {
  'not-configured': 'Instagram isn’t set up yet: INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are missing. See the README.',
  denied: 'Instagram access wasn’t approved, so nothing was connected.',
  state: 'That sign-in link had expired or didn’t start here. Try connecting again.',
  connect: 'Instagram didn’t accept the connection. Check the app settings in the README and try again.',
}

function currentTime(): Date {
  return new Date()
}

type AccountRow = {
  ig_user_id: string
  username: string
  token_expires_at: string
  last_synced_at: string | null
  last_sync_error: string | null
}

// Reads every order since `from`, a page of 1000 at a time.
async function ordersSince(supabase: ReturnType<typeof createServiceClient>, from: string): Promise<OrderRow[]> {
  const rows: OrderRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, status:blanxer_status')
      .gte('created_at', from)
      .order('created_at')
      .order('id')
      .range(offset, offset + 999)
    if (error) throw new Error(`Failed to load orders: ${error.message}`)
    rows.push(...((data ?? []) as unknown as OrderRow[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ days?: string; error?: string; connected?: string }> }) {
  await requireUser()
  const params = await searchParams
  const range = INSTAGRAM_RANGE_OPTIONS.includes(Number(params.days)) ? Number(params.days) : DEFAULT_INSTAGRAM_RANGE
  const errorMessage = params.error ? ERRORS[params.error] ?? 'Something went wrong connecting Instagram.' : null

  // The service role, because the account row holds the access token.
  const supabase = createServiceClient()
  const { data: account, error: accountError } = await supabase
    .from('instagram_account')
    .select('ig_user_id, username, token_expires_at, last_synced_at, last_sync_error')
    .maybeSingle<AccountRow>()
  if (accountError) throw new Error(`Failed to load the Instagram account: ${accountError.message}`)

  if (!account) {
    return (
      <div className="page-narrow">
        <h1 className="text-2xl font-bold text-ink">Instagram</h1>
        <p className="mb-6 text-sm text-muted">Followers, reach and post figures from the CoversBee Instagram account, next to orders.</p>
        {errorMessage && <p className="card mb-4 text-sm text-negative">{errorMessage}</p>}
        <div className="card space-y-3">
          <p className="text-ink-soft">
            Connect the account once. You&rsquo;ll sign in to Instagram and approve read access to the profile and its insights. The app can&rsquo;t post or change anything.
          </p>
          <p className="text-sm text-muted">The account must be a Business or Creator account.</p>
          {instagramConfig() ? (
            <a href="/api/instagram/connect" className="btn-gold inline-block">Connect Instagram</a>
          ) : (
            <p className="text-sm text-negative">INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET aren&rsquo;t set yet. See &ldquo;Instagram setup&rdquo; in the README.</p>
          )}
        </div>
      </div>
    )
  }

  const now = currentTime()
  const cutoff = addDays(nepalDay(now), -range - 1)
  const [dailyResult, mediaResult, orders] = await Promise.all([
    supabase
      .from('instagram_daily')
      .select('day, followers_count, reach, views, total_interactions, profile_links_taps, metrics_synced_at')
      .eq('ig_user_id', account.ig_user_id)
      .gte('day', cutoff)
      .order('day'),
    supabase
      .from('instagram_media')
      .select('id, caption, media_type, media_product_type, permalink, posted_at, like_count, comments_count, reach, views, saved, shares')
      .eq('ig_user_id', account.ig_user_id)
      .gte('posted_at', `${cutoff}T00:00:00Z`)
      .order('posted_at', { ascending: false })
      .limit(1000),
    ordersSince(supabase, `${cutoff}T00:00:00Z`),
  ])
  if (dailyResult.error) throw new Error(`Failed to load Instagram days: ${dailyResult.error.message}`)
  if (mediaResult.error) throw new Error(`Failed to load Instagram posts: ${mediaResult.error.message}`)

  const summary = instagramSummary(
    (dailyResult.data ?? []) as DailyRow[],
    (mediaResult.data ?? []) as MediaRow[],
    orders,
    now,
    range
  )
  const stale = !account.last_synced_at || now.getTime() - Date.parse(account.last_synced_at) > STALE_AFTER_MS
  const expiresSoon = Date.parse(account.token_expires_at) - now.getTime() < EXPIRY_WARNING_MS
  const rangeNote = `Last ${range} days`
  const missingDays = range - summary.daysWithFigures

  return (
    <div className="page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Instagram</h1>
          <p className="text-sm text-muted">
            @{account.username} · {account.last_synced_at ? `synced ${formatDate(account.last_synced_at)}` : 'not synced yet'} ·{' '}
            <a href="/api/instagram/connect" className="underline hover:text-ink">Connect again</a>
          </p>
        </div>
        <SyncInstagramButton stale={stale} />
      </div>

      {params.connected && <p className="card mb-4 text-sm text-positive">Instagram is connected. The first sync reads up to 90 days of history.</p>}
      {errorMessage && <p className="card mb-4 text-sm text-negative">{errorMessage}</p>}
      {account.last_sync_error && <p className="card mb-4 text-sm text-negative">Last sync failed: {account.last_sync_error}</p>}
      {expiresSoon && (
        <p className="card mb-4 text-sm text-negative">
          The Instagram connection runs out on {formatDate(account.token_expires_at)}. Syncing renews it, or connect again.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {INSTAGRAM_RANGE_OPTIONS.map((option) => (
          <Link key={option} href={`/social/instagram?days=${option}`} className={option === range ? 'btn-gold' : 'btn-outline'}>
            {option} days
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Followers"
          value={summary.followers?.toLocaleString() ?? '—'}
          note={
            summary.followerChange
              ? `${summary.followerChange.change >= 0 ? '+' : ''}${summary.followerChange.change.toLocaleString()} since ${formatDate(summary.followerChange.since)}`
              : 'History starts today'
          }
        />
        <StatTile label="Reach" value={summary.totals.reach.toLocaleString()} note={`${rangeNote}, daily totals added up`} />
        <StatTile label="Views" value={summary.totals.views.toLocaleString()} note={rangeNote} />
        <StatTile label="Interactions" value={summary.totals.interactions.toLocaleString()} note="Likes, comments, saves, shares" />
        <StatTile label="Link taps" value={summary.totals.linkTaps.toLocaleString()} note="Taps on profile links and buttons" />
      </div>
      {missingDays > 0 && (
        <p className="mb-4 text-xs text-muted">
          {missingDays} of the {range} days have no Instagram figures yet{range === 90 ? ' (Instagram keeps 89 days of history)' : ''}.
        </p>
      )}

      <InstagramCharts days={summary.days} followerHistory={summary.followerHistory} />

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">Top posts, last {range} days</h2>
        {summary.topPosts.length > 0 ? (
          <div className="table-shell overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Type</th>
                  <th>Posted</th>
                  <th>Reach</th>
                  <th>Views</th>
                  <th>Likes</th>
                  <th>Comments</th>
                  <th>Saves</th>
                  <th>Shares</th>
                </tr>
              </thead>
              <tbody>
                {summary.topPosts.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-xs">
                      {m.permalink ? (
                        <a href={m.permalink} target="_blank" rel="noreferrer" className="line-clamp-2 text-ink hover:underline">
                          {m.caption?.trim() || 'Untitled post'}
                        </a>
                      ) : (
                        <span className="line-clamp-2 text-ink">{m.caption?.trim() || 'Untitled post'}</span>
                      )}
                    </td>
                    <td className="text-ink-soft">{postKind(m)}</td>
                    <td className="whitespace-nowrap text-ink-soft">{formatDate(m.posted_at)}</td>
                    {[m.reach, m.views, m.like_count, m.comments_count, m.saved, m.shares].map((value, i) => (
                      <td key={i} className="tabular-nums text-ink-soft">{value?.toLocaleString() ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-center">
            <p className="text-ink-soft">No posts in the last {range} days.</p>
          </div>
        )}
      </section>
    </div>
  )
}
