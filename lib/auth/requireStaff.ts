import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

// Shared auth guard for API routes. Uses the same @supabase/ssr cookie-based
// server client pattern as proxy.ts (getAll/setAll cookie adapter reading the
// incoming request's cookies) so it respects the staff member's real session
// rather than trusting the request unconditionally. Route handlers don't need
// to write cookies back (no session refresh happens mid-request the way it
// does in Proxy), so setAll is a no-op here.
export async function requireStaff(request: NextRequest): Promise<User | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {
          // No-op: API routes don't need to propagate refreshed session
          // cookies back to the client the way proxy.ts does.
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
