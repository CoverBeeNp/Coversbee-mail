'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { NAV_GROUPS, activeHref, type NavLink } from '@/lib/navigation'
import { SyncBlanxerButton } from './orders/SyncBlanxerButton'
import { UserMenu } from './UserMenu'

function linkClass(isActive: boolean): string {
  return `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-gold text-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'
  }`
}

// Opens while you're anywhere in its section, and the arrow opens or closes it
// from elsewhere. Clicking the link itself goes to the page and opens it.
function DropdownLink({ link, active, pathname }: { link: NavLink; active: string | undefined; pathname: string }) {
  const inSection = pathname === link.href || pathname.startsWith(`${link.href}/`)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? inSection
  const children = link.children ?? []

  return (
    <>
      <div className="flex items-center gap-1">
        <Link
          href={link.href}
          onClick={() => setToggled(true)}
          aria-current={link.href === active ? 'page' : undefined}
          className={`flex-1 ${linkClass(link.href === active)}`}
        >
          {link.label}
        </Link>
        <button
          type="button"
          onClick={() => setToggled(!open)}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} ${link.label} pages`}
          className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg aria-hidden viewBox="0 0 16 16" className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      {open &&
        children.map((child) => (
          <Link
            key={child.href}
            href={child.href}
            aria-current={child.href === active ? 'page' : undefined}
            className={`md:ml-4 ${linkClass(child.href === active)}`}
          >
            {child.label}
          </Link>
        ))}
    </>
  )
}

export function StaffNav({ email }: { email: string | null }) {
  const pathname = usePathname()
  const active = activeHref(pathname)

  return (
    <aside className="z-10 flex shrink-0 flex-col bg-ink md:sticky md:top-0 md:h-screen md:w-60 print:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:space-y-3 md:px-3 md:pb-0 md:pt-4">
        <Link href="/overview" aria-label="Coversbee Data home" className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-80 md:px-2 md:py-1">
          <Image src="/logo.png" alt="CoversBee" width={28} height={27} priority />
          <span className="text-sm font-bold tracking-wide text-white">
            Coversbee <span className="text-gold">Data</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 md:block md:border-y md:border-white/10 md:py-3">
          <SyncBlanxerButton />
          <div className="md:hidden">
            <UserMenu email={email} />
          </div>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-5 md:overflow-y-auto md:py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.links[0].href} className="flex shrink-0 gap-1 md:flex-col">
            {group.label && (
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40 md:block">
                {group.label}
              </p>
            )}
            {group.links.map((link) =>
              link.children ? (
                <DropdownLink key={link.href} link={link} active={active} pathname={pathname} />
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.href === active ? 'page' : undefined}
                  className={linkClass(link.href === active)}
                >
                  {link.label}
                </Link>
              )
            )}
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-white/10 p-3 md:block">
        <UserMenu email={email} />
      </div>
    </aside>
  )
}
