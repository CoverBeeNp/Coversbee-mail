'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_GROUPS, activeHref } from '@/lib/navigation'
import { LogOutButton } from './nav-actions'
import { SyncBlanxerButton } from './orders/SyncBlanxerButton'

export function StaffNav() {
  const pathname = usePathname()
  const active = activeHref(pathname)

  return (
    <aside className="z-10 flex shrink-0 flex-col bg-ink md:sticky md:top-0 md:h-screen md:w-60 print:hidden">
      <Link href="/overview" className="flex items-center gap-2 px-5 py-4">
        <Image src="/logo.png" alt="CoversBee" width={28} height={27} priority />
        <span className="text-sm font-bold tracking-wide text-white">
          Coversbee <span className="text-gold">Data</span>
        </span>
      </Link>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-5 md:overflow-y-auto md:py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.links[0].href} className="flex shrink-0 gap-1 md:flex-col">
            {group.label && (
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40 md:block">
                {group.label}
              </p>
            )}
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.href === active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  link.href === active ? 'bg-gold text-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="hidden space-y-3 border-t border-white/10 p-4 md:block">
        <SyncBlanxerButton />
        <LogOutButton />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 md:hidden">
        <SyncBlanxerButton />
        <LogOutButton />
      </div>
    </aside>
  )
}
