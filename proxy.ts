import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Reached from email links, never by a logged-in staff member — must stay
// public even though the matcher below otherwise covers all of /api/:path*.
const PUBLIC_PATHS = ['/login', '/api/unsubscribe']

export async function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

export const config = { matcher: ['/overview/:path*', '/orders/:path*', '/campaigns/:path*', '/customers/:path*', '/email-log/:path*', '/api/:path*'] }
