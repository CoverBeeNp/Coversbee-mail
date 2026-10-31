import { previousMonthKey } from '@/lib/statements/monthKey'

export type Todo = { label: string; detail: string; count: number | null; href: string }

export type TodoInput = {
  received: number
  dispatched: number
  outForDelivery: number
  failedSends: number
  sendingCampaigns: number
  statementMonths: string[]
  now: Date
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Most urgent first. Items with nothing to do are left out, so an empty list
// really does mean the day's work is done.
export function buildTodos(input: TodoInput): Todo[] {
  const todos: Todo[] = []

  if (input.failedSends > 0) {
    todos.push({
      label: 'Fix failed emails',
      detail: `${plural(input.failedSends, 'email')} failed in the last 30 days`,
      count: input.failedSends,
      href: '/email-log',
    })
  }
  if (input.received > 0) {
    todos.push({
      label: 'Dispatch orders',
      detail: `${plural(input.received, 'order')} waiting to be sent out`,
      count: input.received,
      href: '/orders?status=received',
    })
  }
  if (input.dispatched > 0) {
    todos.push({
      label: 'Follow up on dispatched orders',
      detail: `${plural(input.dispatched, 'order')} on the way`,
      count: input.dispatched,
      href: '/orders?status=dispatched',
    })
  }
  if (input.outForDelivery > 0) {
    todos.push({
      label: 'Confirm deliveries',
      detail: `${plural(input.outForDelivery, 'order')} out for delivery`,
      count: input.outForDelivery,
      href: '/orders?status=out_for_delivery',
    })
  }
  if (input.sendingCampaigns > 0) {
    todos.push({
      label: 'Watch sending campaigns',
      detail: `${plural(input.sendingCampaigns, 'campaign')} still going out`,
      count: input.sendingCampaigns,
      href: '/campaigns',
    })
  }

  const lastMonth = previousMonthKey(input.now.toISOString().slice(0, 7))
  if (!input.statementMonths.includes(lastMonth)) {
    todos.push({
      label: `Generate the ${monthLabel(lastMonth)} statement`,
      detail: 'Locks in last month’s figures',
      count: null,
      href: '/finance/statements',
    })
  }

  return todos
}
