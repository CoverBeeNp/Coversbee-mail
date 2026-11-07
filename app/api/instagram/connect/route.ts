import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { authorizeUrl } from '@/lib/instagram/client'
import { STATE_COOKIE, instagramConfig } from '@/lib/instagram/config'

// Sends the staff member to Instagram to approve read access. The state value
// is checked on the way back, so a callback this browser didn't start is
// refused.
export async function GET(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const config = instagramConfig()
  if (!config) return NextResponse.redirect(new URL('/social/instagram?error=not-configured', request.url))

  const state = crypto.randomUUID()
  const response = NextResponse.redirect(authorizeUrl(config.appId, config.redirectUri, state))
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/instagram',
    maxAge: 10 * 60,
  })
  return response
}
