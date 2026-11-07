// Instagram API with Instagram Login (Business Login for Instagram). Works for
// Business and Creator accounts. Every call uses `me`, so the token decides
// which account is read.
// Docs: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

export const GRAPH_URL = 'https://graph.instagram.com/v27.0'
export const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights']

// Daily totals for the whole account. Each is a `period=day` total_value metric.
export const ACCOUNT_METRICS = [
  'reach',
  'views',
  'accounts_engaged',
  'total_interactions',
  'likes',
  'comments',
  'shares',
  'saves',
  'profile_links_taps',
] as const
export type AccountMetric = (typeof ACCOUNT_METRICS)[number]

// Lifetime figures for one post or reel. All of these apply to both.
export const MEDIA_METRICS = ['reach', 'views', 'saved', 'shares', 'total_interactions'] as const
export type MediaMetric = (typeof MEDIA_METRICS)[number]

export type InstagramProfile = {
  userId: string
  username: string
  followersCount: number | null
  followsCount: number | null
  mediaCount: number | null
}

export type InstagramMedia = {
  id: string
  caption: string | null
  mediaType: string
  mediaProductType: string | null
  permalink: string | null
  timestamp: string
  likeCount: number | null
  commentsCount: number | null
}

export class InstagramApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: number | null) {
    super(message)
  }

  // Code 190 is Meta's "access token invalid or expired".
  get tokenInvalid(): boolean {
    return this.code === 190
  }
}

async function readJson(res: Response, what: string) {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const error = body?.error
    const message = error?.message ?? body?.error_message ?? `HTTP ${res.status}`
    throw new InstagramApiError(`Instagram ${what} failed (${res.status}): ${message}`, res.status, error?.code ?? null)
  }
  return body
}

async function graphGet(path: string, params: Record<string, string>, what: string) {
  const res = await fetch(`${GRAPH_URL}${path}?${new URLSearchParams(params)}`, { cache: 'no-store' })
  return readJson(res, what)
}

export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${params}`
}

// The code from the redirect, swapped for a short-lived token and then a
// 60-day one. Instagram appends `#_` to the code, which has to go.
export async function exchangeCode(
  appId: string,
  appSecret: string,
  redirectUri: string,
  code: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: code.replace(/#_$/, ''),
    }),
  })
  const shortLived = await readJson(res, 'code exchange')
  const shortToken: string | undefined = shortLived?.access_token ?? shortLived?.data?.[0]?.access_token
  if (!shortToken) throw new Error('Instagram code exchange returned no access token')

  const longLived = await graphGetRoot(
    '/access_token',
    { grant_type: 'ig_exchange_token', client_secret: appSecret, access_token: shortToken },
    'long-lived token exchange'
  )
  return { accessToken: longLived.access_token, expiresAt: expiryFrom(longLived.expires_in) }
}

// Gives another 60 days. Instagram allows it once the token is a day old.
export async function refreshToken(accessToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = await graphGetRoot(
    '/refresh_access_token',
    { grant_type: 'ig_refresh_token', access_token: accessToken },
    'token refresh'
  )
  return { accessToken: body.access_token, expiresAt: expiryFrom(body.expires_in) }
}

// The token endpoints sit outside the versioned path.
async function graphGetRoot(path: string, params: Record<string, string>, what: string) {
  const res = await fetch(`https://graph.instagram.com${path}?${new URLSearchParams(params)}`, { cache: 'no-store' })
  return readJson(res, what)
}

function expiryFrom(expiresIn: unknown): Date {
  const seconds = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 60 * 24 * 60 * 60
  return new Date(Date.now() + seconds * 1000)
}

export async function getProfile(accessToken: string): Promise<InstagramProfile> {
  const body = await graphGet(
    '/me',
    { fields: 'user_id,username,followers_count,follows_count,media_count', access_token: accessToken },
    'profile'
  )
  return {
    userId: String(body.user_id ?? body.id),
    username: body.username,
    followersCount: numberOrNull(body.followers_count),
    followsCount: numberOrNull(body.follows_count),
    mediaCount: numberOrNull(body.media_count),
  }
}

// Every post and reel, newest first, following Instagram's paging.
export async function listMedia(accessToken: string, maxItems = 1000): Promise<InstagramMedia[]> {
  const items: InstagramMedia[] = []
  let url: string | null = `${GRAPH_URL}/me/media?${new URLSearchParams({
    fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    limit: '100',
    access_token: accessToken,
  })}`
  while (url && items.length < maxItems) {
    const res: Response = await fetch(url, { cache: 'no-store' })
    const body = await readJson(res, 'media list')
    for (const m of body.data ?? []) {
      items.push({
        id: String(m.id),
        caption: m.caption ?? null,
        mediaType: m.media_type,
        mediaProductType: m.media_product_type ?? null,
        permalink: m.permalink ?? null,
        timestamp: m.timestamp,
        likeCount: numberOrNull(m.like_count),
        commentsCount: numberOrNull(m.comments_count),
      })
    }
    url = body.paging?.next ?? null
  }
  return items.slice(0, maxItems)
}

// Totals for one day, from `since` up to (not including) `until`.
export async function getAccountDayInsights(
  accessToken: string,
  since: Date,
  until: Date
): Promise<Record<AccountMetric, number | null>> {
  return withMetricFallback(ACCOUNT_METRICS, (metrics) =>
    graphGet(
      '/me/insights',
      {
        metric: metrics.join(','),
        period: 'day',
        metric_type: 'total_value',
        since: String(Math.floor(since.getTime() / 1000)),
        until: String(Math.floor(until.getTime() / 1000)),
        access_token: accessToken,
      },
      'account insights'
    )
  )
}

export async function getMediaInsights(accessToken: string, mediaId: string): Promise<Record<MediaMetric, number | null>> {
  return withMetricFallback(MEDIA_METRICS, (metrics) =>
    graphGet(`/${encodeURIComponent(mediaId)}/insights`, { metric: metrics.join(','), access_token: accessToken }, 'post insights')
  )
}

// Asks for every metric at once. Instagram fails the whole request if one
// metric doesn't apply (an older post, a small account), so on failure each is
// asked for alone and the ones that still fail are left empty. A bad token
// fails every metric the same way, so that error is passed on instead.
async function withMetricFallback<M extends string>(
  metrics: readonly M[],
  request: (metrics: readonly M[]) => Promise<{ data?: InsightRow[] }>
): Promise<Record<M, number | null>> {
  const result = Object.fromEntries(metrics.map((m) => [m, null])) as Record<M, number | null>
  try {
    Object.assign(result, parseInsights(await request(metrics), metrics))
    return result
  } catch (err) {
    if (err instanceof InstagramApiError && err.tokenInvalid) throw err
    if (metrics.length === 1) return result
  }
  for (const metric of metrics) {
    try {
      Object.assign(result, parseInsights(await request([metric]), [metric]))
    } catch (err) {
      if (err instanceof InstagramApiError && err.tokenInvalid) throw err
    }
  }
  return result
}

type InsightRow = { name: string; total_value?: { value?: unknown }; values?: { value?: unknown }[] }

export function parseInsights<M extends string>(body: { data?: InsightRow[] }, metrics: readonly M[]): Partial<Record<M, number | null>> {
  const out: Partial<Record<M, number | null>> = {}
  for (const row of body.data ?? []) {
    if (!metrics.includes(row.name as M)) continue
    out[row.name as M] = numberOrNull(row.total_value?.value ?? row.values?.[0]?.value)
  }
  return out
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
