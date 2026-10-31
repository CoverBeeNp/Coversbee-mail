export type NavLink = { href: string; label: string }
export type NavGroup = { label: string | null; links: NavLink[] }

// The sidebar follows the working day: see what needs doing, fulfil orders,
// talk to customers, then look after the money.
export const NAV_GROUPS: NavGroup[] = [
  { label: null, links: [{ href: '/overview', label: 'Today' }] },
  {
    label: 'Orders',
    links: [
      { href: '/orders', label: 'Orders' },
      { href: '/customers', label: 'Customers' },
    ],
  },
  {
    label: 'Marketing',
    links: [
      { href: '/campaigns', label: 'Campaigns' },
      { href: '/email-log', label: 'Email log' },
    ],
  },
  {
    label: 'Finance',
    links: [
      { href: '/finance', label: 'Dashboard' },
      { href: '/finance/orders', label: 'Orders outside Blanxer' },
      { href: '/finance/expenses', label: 'Expenses' },
      { href: '/finance/expenses/categories', label: 'Categories' },
      { href: '/finance/statements', label: 'Statements' },
    ],
  },
]

// Longest match wins, so /finance/expenses/categories lights up only
// "Categories", and /finance/orders doesn't also light up "Dashboard".
export function activeHref(pathname: string, groups: NavGroup[] = NAV_GROUPS): string | undefined {
  return groups
    .flatMap((group) => group.links)
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}
