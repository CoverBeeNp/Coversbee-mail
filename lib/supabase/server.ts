import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// RLS-respecting server client for Server Components, built from the
// request's cookies (anon key + the staff member's session). Use this for
// page data instead of createServiceClient() so RLS is a real second layer
// of defense, not bypassed for reads. Server Components can't set cookies
// (proxy.ts already refreshes the session), so setAll is a no-op guarded
// with try/catch per the @supabase/ssr docs.
export async function createServerClient() {
  const cookieStore = await cookies()
  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component that can't set cookies; the
            // session is already refreshed by proxy.ts, so this is safe to
            // ignore per the @supabase/ssr docs.
          }
        },
      },
    }
  )
}
