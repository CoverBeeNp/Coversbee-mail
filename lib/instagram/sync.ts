import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getAccountDayInsights,
  getMediaInsights,
  getProfile,
  listMedia,
  refreshToken,
  InstagramApiError,
  type InstagramMedia,
} from './client'
import { daysToSync, nepalDay, nepalDayBounds } from './days'

const DAY_MS = 24 * 60 * 60 * 1000
// Renewed weekly, well inside the 60 days it lasts. Instagram needs it to be at
// least a day old.
const REFRESH_TOKEN_AFTER_MS = 7 * DAY_MS
// Recent posts keep collecting views, so their figures are read again.
const RECENT_POST_MS = 30 * DAY_MS
const RECENT_POST_RECHECK_MS = 12 * 60 * 60 * 1000
const CONCURRENCY = 4

export type InstagramAccountRow = {
  ig_user_id: string
  username: string
  access_token: string
  token_expires_at: string
  token_refreshed_at: string
  last_synced_at: string | null
}

export type InstagramSyncResult = {
  username: string
  followers: number | null
  daysSynced: number
  daysRemaining: number
  posts: number
  postsUpdated: number
  postsRemaining: number
}

export class InstagramNotConnectedError extends Error {}

export async function getInstagramAccount(supabase: SupabaseClient): Promise<InstagramAccountRow | null> {
  const { data, error } = await supabase
    .from('instagram_account')
    .select('ig_user_id, username, access_token, token_expires_at, token_refreshed_at, last_synced_at')
    .maybeSingle()
  if (error) throw new Error(`Failed to load the Instagram account: ${error.message}`)
  return data as InstagramAccountRow | null
}

// Reads the account into instagram_daily and instagram_media. Stops at the
// deadline; whatever is left is read next time. Only ever reads from Instagram.
export async function syncInstagram(
  supabase: SupabaseClient,
  { now, deadline }: { now: Date; deadline: number }
): Promise<InstagramSyncResult> {
  const account = await getInstagramAccount(supabase)
  if (!account) throw new InstagramNotConnectedError('Instagram is not connected')

  try {
    const result = await syncAccount(supabase, account, now, deadline)
    await update(supabase, { last_synced_at: now.toISOString(), last_sync_error: null })
    return result
  } catch (err) {
    // Shown on the page. Saving it mustn't hide the original error.
    await update(supabase, { last_sync_error: (err as Error).message }).catch(() => {})
    throw err
  }
}

async function syncAccount(
  supabase: SupabaseClient,
  account: InstagramAccountRow,
  now: Date,
  deadline: number
): Promise<InstagramSyncResult> {
  if (Date.parse(account.token_expires_at) <= now.getTime()) {
    throw new Error('The Instagram connection has expired. Connect Instagram again.')
  }
  let token = account.access_token
  if (now.getTime() - Date.parse(account.token_refreshed_at) > REFRESH_TOKEN_AFTER_MS) {
    const refreshed = await refreshToken(token)
    token = refreshed.accessToken
    await update(supabase, {
      access_token: token,
      token_expires_at: refreshed.expiresAt.toISOString(),
      token_refreshed_at: now.toISOString(),
    })
  }

  let profile
  try {
    profile = await getProfile(token)
  } catch (err) {
    if (err instanceof InstagramApiError && err.tokenInvalid) {
      throw new Error('Instagram no longer accepts the connection. Connect Instagram again.')
    }
    throw err
  }
  const igUserId = account.ig_user_id
  await update(supabase, { username: profile.username })
  await upsert(supabase, 'instagram_daily', [
    {
      ig_user_id: igUserId,
      day: nepalDay(now),
      followers_count: profile.followersCount,
      follows_count: profile.followsCount,
      media_count: profile.mediaCount,
    },
  ], 'ig_user_id,day')

  // Daily account figures.
  const { data: syncedRows, error: syncedError } = await supabase
    .from('instagram_daily')
    .select('day')
    .eq('ig_user_id', igUserId)
    .not('metrics_synced_at', 'is', null)
  if (syncedError) throw new Error(`Failed to load Instagram days: ${syncedError.message}`)
  const days = daysToSync(now, (syncedRows ?? []).map((r) => r.day as string))
  const daysDone = await inBatches(days, deadline, async (day) => {
    const { start, end } = nepalDayBounds(day)
    const metrics = await getAccountDayInsights(token, start, end)
    await upsert(supabase, 'instagram_daily', [
      { ig_user_id: igUserId, day, ...metrics, metrics_synced_at: new Date().toISOString() },
    ], 'ig_user_id,day')
  })

  // Posts and reels.
  const media = Date.now() < deadline ? await listMedia(token) : []
  for (let i = 0; i < media.length; i += 500) {
    await upsert(supabase, 'instagram_media', media.slice(i, i + 500).map((m) => mediaRow(igUserId, m)), 'id')
  }
  const lastRead = await mediaInsightTimes(supabase, igUserId)
  const due = media.filter((m) => insightsDue(m, lastRead.get(m.id), now))
  const postsDone = await inBatches(due, deadline, async (m) => {
    const insights = await getMediaInsights(token, m.id)
    const { error } = await supabase
      .from('instagram_media')
      .update({ ...insights, insights_updated_at: new Date().toISOString() })
      .eq('id', m.id)
    if (error) throw new Error(`Failed to save Instagram post: ${error.message}`)
  })

  return {
    username: profile.username,
    followers: profile.followersCount,
    daysSynced: daysDone,
    daysRemaining: days.length - daysDone,
    posts: media.length,
    postsUpdated: postsDone,
    postsRemaining: due.length - postsDone,
  }
}

function mediaRow(igUserId: string, m: InstagramMedia) {
  return {
    id: m.id,
    ig_user_id: igUserId,
    caption: m.caption,
    media_type: m.mediaType,
    media_product_type: m.mediaProductType,
    permalink: m.permalink,
    posted_at: m.timestamp,
    like_count: m.likeCount,
    comments_count: m.commentsCount,
    updated_at: new Date().toISOString(),
  }
}

// Posts never read, and recent ones not read in the last 12 hours.
export function insightsDue(m: Pick<InstagramMedia, 'timestamp'>, lastRead: string | null | undefined, now: Date): boolean {
  if (!lastRead) return true
  const recent = now.getTime() - Date.parse(m.timestamp) < RECENT_POST_MS
  return recent && now.getTime() - Date.parse(lastRead) > RECENT_POST_RECHECK_MS
}

async function mediaInsightTimes(supabase: SupabaseClient, igUserId: string): Promise<Map<string, string | null>> {
  const times = new Map<string, string | null>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('instagram_media')
      .select('id, insights_updated_at')
      .eq('ig_user_id', igUserId)
      .order('id')
      .range(offset, offset + 999)
    if (error) throw new Error(`Failed to load Instagram posts: ${error.message}`)
    for (const row of data ?? []) times.set(row.id as string, row.insights_updated_at as string | null)
    if (!data || data.length < 1000) break
  }
  return times
}

// Runs a few at a time, in order, and stops starting new ones at the deadline.
// Returns how many finished.
async function inBatches<T>(items: T[], deadline: number, run: (item: T) => Promise<void>): Promise<number> {
  let done = 0
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) break
    await Promise.all(items.slice(i, i + CONCURRENCY).map(run))
    done += Math.min(CONCURRENCY, items.length - i)
  }
  return done
}

async function update(supabase: SupabaseClient, values: Record<string, unknown>) {
  const { error } = await supabase.from('instagram_account').update(values).eq('id', true)
  if (error) throw new Error(`Failed to save the Instagram account: ${error.message}`)
}

async function upsert(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`Failed to save ${table}: ${error.message}`)
}
