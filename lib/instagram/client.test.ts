import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authorizeUrl, exchangeCode, getAccountDayInsights, getMediaInsights, listMedia, parseInsights } from './client'

const fetchMock = () => fetch as ReturnType<typeof vi.fn>
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status: number, code: number, message = 'bad') => ({ ok: false, status, json: async () => ({ error: { message, code } }) })

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())

describe('authorizeUrl', () => {
  it('asks for read access to the profile and insights only', () => {
    const url = new URL(authorizeUrl('app-1', 'https://example.com/cb', 'st'))
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize')
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_insights')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('response_type')).toBe('code')
  })
})

describe('exchangeCode', () => {
  it('strips #_ from the code and swaps the short token for a long one', async () => {
    fetchMock()
      .mockResolvedValueOnce(ok({ data: [{ access_token: 'short', user_id: '1' }] }))
      .mockResolvedValueOnce(ok({ access_token: 'long', expires_in: 5184000 }))

    const result = await exchangeCode('app', 'secret', 'https://example.com/cb', 'abc#_')

    expect(result.accessToken).toBe('long')
    const [, init] = fetchMock().mock.calls[0]
    expect(new URLSearchParams(init.body).get('code')).toBe('abc')
    const longUrl = new URL(fetchMock().mock.calls[1][0])
    expect(longUrl.searchParams.get('grant_type')).toBe('ig_exchange_token')
    expect(longUrl.searchParams.get('access_token')).toBe('short')
  })
})

describe('parseInsights', () => {
  it('reads total_value and values shapes, and only the metrics asked for', () => {
    expect(
      parseInsights(
        { data: [{ name: 'reach', total_value: { value: 12 } }, { name: 'views', values: [{ value: 30 }] }, { name: 'other', total_value: { value: 1 } }] },
        ['reach', 'views']
      )
    ).toEqual({ reach: 12, views: 30 })
  })
})

describe('getAccountDayInsights', () => {
  it('asks for the day as unix seconds and leaves missing metrics empty', async () => {
    fetchMock().mockResolvedValueOnce(ok({ data: [{ name: 'reach', total_value: { value: 40 } }] }))
    const result = await getAccountDayInsights('tok', new Date('2026-11-05T18:15:00Z'), new Date('2026-11-06T18:15:00Z'))
    expect(result.reach).toBe(40)
    expect(result.views).toBeNull()
    const url = new URL(fetchMock().mock.calls[0][0])
    expect(url.pathname).toBe('/v27.0/me/insights')
    expect(url.searchParams.get('since')).toBe('1793902500')
    expect(url.searchParams.get('metric_type')).toBe('total_value')
  })
})

describe('getMediaInsights', () => {
  it('falls back to one metric at a time when the combined request fails', async () => {
    fetchMock().mockImplementation(async (url: string) => {
      const metric = new URL(url).searchParams.get('metric')
      if (metric?.includes(',')) return fail(400, 100)
      if (metric === 'views') return fail(400, 100)
      return ok({ data: [{ name: metric, values: [{ value: 5 }] }] })
    })
    const result = await getMediaInsights('tok', 'm1')
    expect(result).toEqual({ reach: 5, views: null, saved: 5, shares: 5, total_interactions: 5 })
  })

  it('passes an invalid token error on instead of hiding it', async () => {
    fetchMock().mockResolvedValue(fail(400, 190, 'Error validating access token'))
    await expect(getMediaInsights('tok', 'm1')).rejects.toThrow('Error validating access token')
    expect(fetchMock()).toHaveBeenCalledTimes(1)
  })
})

describe('listMedia', () => {
  it('follows paging', async () => {
    fetchMock()
      .mockResolvedValueOnce(ok({ data: [{ id: '1', media_type: 'IMAGE', timestamp: '2026-11-01T00:00:00+0000' }], paging: { next: 'https://graph.instagram.com/next' } }))
      .mockResolvedValueOnce(ok({ data: [{ id: '2', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-01T00:00:00+0000', like_count: 3 }] }))
    const media = await listMedia('tok')
    expect(media.map((m) => m.id)).toEqual(['1', '2'])
    expect(media[1]).toMatchObject({ mediaProductType: 'REELS', likeCount: 3, caption: null })
    expect(fetchMock().mock.calls[1][0]).toBe('https://graph.instagram.com/next')
  })
})
