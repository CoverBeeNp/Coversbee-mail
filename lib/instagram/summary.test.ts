import { describe, it, expect } from 'vitest'
import { instagramSummary, postKind, type DailyRow } from './summary'

const now = new Date('2026-11-06T06:00:00Z') // 2026-11-06 in Nepal
const day = (d: string, values: Partial<DailyRow>): DailyRow => ({
  day: d,
  followers_count: null,
  reach: null,
  views: null,
  total_interactions: null,
  profile_links_taps: null,
  metrics_synced_at: null,
  ...values,
})

describe('instagramSummary', () => {
  it('adds up finished days only and counts orders by Nepal day', () => {
    const summary = instagramSummary(
      [
        day('2026-11-04', { reach: 100, views: 300, metrics_synced_at: 'x', followers_count: 500 }),
        day('2026-11-05', { reach: 50, views: 100, total_interactions: 7, metrics_synced_at: 'x' }),
        day('2026-11-06', { followers_count: 510 }),
      ],
      [],
      [
        { created_at: '2026-11-04T19:00:00Z', status: 'Delivered' }, // 2026-11-05 in Nepal
        { created_at: '2026-11-05T05:00:00Z', status: 'Cancelled' },
        { created_at: '2026-11-05T06:00:00Z', status: null },
      ],
      now,
      7
    )
    expect(summary.days).toHaveLength(7)
    expect(summary.days.at(-1)).toEqual({ day: '2026-11-05', reach: 50, views: 100, orders: 2 })
    expect(summary.totals).toMatchObject({ reach: 150, views: 400, interactions: 7, orders: 2 })
    expect(summary.daysWithFigures).toBe(2)
    expect(summary.followers).toBe(510)
    expect(summary.followerChange).toEqual({ change: 10, since: '2026-11-04' })
  })

  it('has no follower change with only one snapshot', () => {
    const summary = instagramSummary([day('2026-11-06', { followers_count: 510 })], [], [], now, 30)
    expect(summary.followerChange).toBeNull()
    expect(summary.followers).toBe(510)
  })

  it('ranks posts in the range by reach', () => {
    const base = { caption: null, media_type: 'IMAGE', media_product_type: 'FEED', permalink: null, like_count: null, comments_count: null, views: null, saved: null, shares: null }
    const summary = instagramSummary(
      [],
      [
        { ...base, id: 'a', posted_at: '2026-11-01T00:00:00Z', reach: 10 },
        { ...base, id: 'b', posted_at: '2026-11-02T00:00:00Z', reach: 90 },
        { ...base, id: 'old', posted_at: '2026-01-01T00:00:00Z', reach: 999 },
      ],
      [],
      now,
      30
    )
    expect(summary.topPosts.map((m) => m.id)).toEqual(['b', 'a'])
  })
})

describe('postKind', () => {
  it.each([
    [{ media_type: 'VIDEO', media_product_type: 'REELS' }, 'Reel'],
    [{ media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED' }, 'Carousel'],
    [{ media_type: 'IMAGE', media_product_type: 'FEED' }, 'Photo'],
  ])('%o is a %s', (m, kind) => {
    expect(postKind(m)).toBe(kind)
  })
})
