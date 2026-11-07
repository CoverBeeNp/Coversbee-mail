import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { createServiceClient } from '@/lib/supabase/server'
import { exchangeCode, getProfile } from '@/lib/instagram/client'
import { STATE_COOKIE, instagramConfig } from '@/lib/instagram/config'

// Instagram sends the browser back here after the staff member approves.
// Saves the 60-day token, replacing any account connected before.
export async function GET(request: NextRequest) {
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/social/instagram?${query}`, request.url))
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/instagram' })
    return response
  }

  const user = await requireStaff(request)
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const params = request.nextUrl.searchParams
  if (params.get('error')) return back('error=denied')

  const state = params.get('state')
  const code = params.get('code')
  const expected = request.cookies.get(STATE_COOKIE)?.value
  if (!code || !state || !expected || state !== expected) return back('error=state')

  const config = instagramConfig()
  if (!config) return back('error=not-configured')

  try {
    const { accessToken, expiresAt } = await exchangeCode(config.appId, config.appSecret, config.redirectUri, code)
    const profile = await getProfile(accessToken)
    const now = new Date().toISOString()
    const { error } = await createServiceClient()
      .from('instagram_account')
      .upsert({
        id: true,
        ig_user_id: profile.userId,
        username: profile.username,
        access_token: accessToken,
        token_expires_at: expiresAt.toISOString(),
        token_refreshed_at: now,
        connected_at: now,
        last_synced_at: null,
        last_sync_error: null,
      })
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('Instagram connect failed:', (err as Error).message)
    return back('error=connect')
  }
  return back('connected=1')
}
