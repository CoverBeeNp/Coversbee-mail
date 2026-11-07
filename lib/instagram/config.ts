// The Instagram app's credentials, from the Meta App Dashboard (Instagram →
// API setup with Instagram login). The redirect URI registered there must be
// exactly this one.
export const STATE_COOKIE = 'ig_oauth_state'

export function instagramConfig(): { appId: string; appSecret: string; redirectUri: string } | null {
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appId || !appSecret || !appUrl) return null
  return { appId, appSecret, redirectUri: `${appUrl.replace(/\/$/, '')}/api/instagram/callback` }
}
