'use client'

import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export function LogOutButton() {
  const router = useRouter()

  async function handleLogOut() {
    const supabase = createBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={handleLogOut} className="text-sm font-medium text-white/70 hover:text-gold">
      Log out
    </button>
  )
}
