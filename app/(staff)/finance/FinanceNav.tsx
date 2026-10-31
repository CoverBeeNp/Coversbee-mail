'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { SyncBlanxerButton } from '../orders/SyncBlanxerButton'

const LINKS = [
  { href: '/finance', label: 'Dashboard' },
  { href: '/finance/orders', label: 'Orders outside Blanxer' },
  { href: '/finance/expenses', label: 'Expenses' },
  { href: '/finance/expenses/categories', label: 'Categories' },
  { href: '/finance/statements', label: 'Statements' },
]

export function FinanceNav() {
  const pathname = usePathname()
  const router = useRouter()

  // Longest-matching href wins, so a sub-section like /finance/expenses/categories
  // activates only "Categories" rather than lighting up "Expenses" too.
  const activeHref = LINKS
    .filter((link) => (link.href === '/finance' ? pathname === '/finance' : pathname.startsWith(link.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <div className="border-b border-line bg-surface print:hidden">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
        <nav className="flex flex-1 flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === activeHref
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-ink text-gold' : 'text-ink-soft hover:bg-paper'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <SyncBlanxerButton onSynced={() => router.refresh()} />
      </div>
    </div>
  )
}
