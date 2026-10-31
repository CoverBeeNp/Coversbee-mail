'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export function UserMenu({ email }: { email: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function logOut() {
    await createBrowserClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const name = email ? email.split('@')[0] : 'Staff'

  return (
    <div ref={container} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-white/10"
      >
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold uppercase text-ink">
          {name.charAt(0)}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-white">{name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-lg md:bottom-full md:left-0 md:right-auto md:top-auto md:mb-2 md:mt-0">
          {email && <p className="truncate px-3 py-2 text-xs text-muted">{email}</p>}
          <button
            type="button"
            role="menuitem"
            onClick={logOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
