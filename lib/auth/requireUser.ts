import { createServerClient } from '@/lib/supabase/server'

// Login check for Server Functions and Server Components. Every exported
// function in a 'use server' file is reachable by direct POST, and proxy.ts
// only covers the paths it lists, so finance code must verify the session
// itself before using the service role.
export async function requireUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  return user
}
