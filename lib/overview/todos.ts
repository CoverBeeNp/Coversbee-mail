import { previousMonthKey } from '@/lib/statements/monthKey'

export type TodoGroup = 'Orders' | 'Emails' | 'Finance'
export type Todo = { group: TodoGroup; label: string; count: number | null; href: string }

export type TodoInput = {
  received: number
  dispatched: number
  outForDelivery: number
  failedSends: number
  statementMonths: string[]
  now: Date
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Grouped by area, in working order. Anything with nothing to do is left out,
// so an empty list really does mean the day's work is done.
export function buildTodos(input: TodoInput): Todo[] {
  const candidates: (Todo & { due: boolean })[] = [
    { group: 'Orders', label: 'Dispatch', count: input.received, href: '/orders?status=received', due: input.received > 0 },
    { group: 'Orders', label: 'Follow up', count: input.dispatched, href: '/orders?status=dispatched', due: input.dispatched > 0 },
    { group: 'Orders', label: 'Confirm delivery', count: input.outForDelivery, href: '/orders?status=out_for_delivery', due: input.outForDelivery > 0 },
    { group: 'Emails', label: 'Fix failed emails', count: input.failedSends, href: '/email-log', due: input.failedSends > 0 },
  ]

  const lastMonth = previousMonthKey(input.now.toISOString().slice(0, 7))
  candidates.push({
    group: 'Finance',
    label: `${monthLabel(lastMonth)} statement`,
    count: null,
    href: '/finance/statements',
    due: !input.statementMonths.includes(lastMonth),
  })

  return candidates.filter((todo) => todo.due).map(({ group, label, count, href }) => ({ group, label, count, href }))
}
