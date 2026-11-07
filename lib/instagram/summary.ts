import { isRevenueOrder } from '@/lib/analytics/orderFilters'
import { addDays, nepalDay } from './days'

export const INSTAGRAM_RANGE_OPTIONS = [7, 30, 90]
export const DEFAULT_INSTAGRAM_RANGE = 30

export type DailyRow = {
  day: string
  followers_count: number | null
  reach: number | null
  views: number | null
  total_interactions: number | null
  profile_links_taps: number | null
  metrics_synced_at: string | null
}

export type MediaRow = {
  id: string
  caption: string | null
  media_type: string
  media_product_type: string | null
  permalink: string | null
  posted_at: string
  like_count: number | null
  comments_count: number | null
  reach: number | null
  views: number | null
  saved: number | null
  shares: number | null
}

export type OrderRow = { created_at: string; status: string | null }

export type DayPoint = { day: string; reach: number | null; views: number | null; orders: number }
export type FollowerPoint = { day: string; followers: number }

export type InstagramSummary = {
  followers: number | null
  followerChange: { change: number; since: string } | null
  totals: { reach: number; views: number; interactions: number; linkTaps: number; orders: number }
  daysWithFigures: number
  days: DayPoint[]
  followerHistory: FollowerPoint[]
  topPosts: MediaRow[]
}

// The last `range` finished Nepal days, oldest first. Orders are counted on the
// same days, leaving out cancelled and returned ones as revenue does.
export function instagramSummary(
  daily: DailyRow[],
  media: MediaRow[],
  orders: OrderRow[],
  now: Date,
  range: number
): InstagramSummary {
  const today = nepalDay(now)
  const first = addDays(today, -range)
  const dayList = Array.from({ length: range }, (_, i) => addDays(first, i))
  const byDay = new Map(daily.map((row) => [row.day, row]))

  const ordersByDay = new Map<string, number>()
  for (const order of orders) {
    if (order.status !== null && !isRevenueOrder(order.status)) continue
    const day = nepalDay(new Date(order.created_at))
    ordersByDay.set(day, (ordersByDay.get(day) ?? 0) + 1)
  }

  const days = dayList.map((day) => {
    const row = byDay.get(day)
    return {
      day,
      reach: row?.metrics_synced_at ? row.reach : null,
      views: row?.metrics_synced_at ? row.views : null,
      orders: ordersByDay.get(day) ?? 0,
    }
  })

  const inRange = dayList.map((day) => byDay.get(day)).filter((row): row is DailyRow => !!row?.metrics_synced_at)
  const sum = (pick: (row: DailyRow) => number | null) => inRange.reduce((total, row) => total + (pick(row) ?? 0), 0)

  const followerHistory = daily
    .filter((row) => row.followers_count !== null && row.day > first)
    .map((row) => ({ day: row.day, followers: row.followers_count as number }))
    .sort((a, b) => a.day.localeCompare(b.day))
  const latest = followerHistory.at(-1)
  const earliest = followerHistory[0]

  const postedFrom = Date.parse(`${first}T00:00:00Z`)
  const topPosts = media
    .filter((m) => Date.parse(m.posted_at) >= postedFrom)
    .sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1) || b.posted_at.localeCompare(a.posted_at))
    .slice(0, 10)

  return {
    followers: latest?.followers ?? null,
    followerChange:
      latest && earliest && latest.day !== earliest.day ? { change: latest.followers - earliest.followers, since: earliest.day } : null,
    totals: {
      reach: sum((row) => row.reach),
      views: sum((row) => row.views),
      interactions: sum((row) => row.total_interactions),
      linkTaps: sum((row) => row.profile_links_taps),
      orders: days.reduce((total, d) => total + d.orders, 0),
    },
    daysWithFigures: inRange.length,
    days,
    followerHistory,
    topPosts,
  }
}

export function postKind(m: Pick<MediaRow, 'media_type' | 'media_product_type'>): string {
  if (m.media_product_type === 'REELS') return 'Reel'
  if (m.media_type === 'CAROUSEL_ALBUM') return 'Carousel'
  if (m.media_type === 'VIDEO') return 'Video'
  return 'Photo'
}
