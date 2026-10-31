import { describe, it, expect } from 'vitest'
import { buildTodos, type TodoInput } from './todos'

const quiet: TodoInput = {
  received: 0,
  dispatched: 0,
  outForDelivery: 0,
  failedSends: 0,
  statementMonths: ['2026-09'],
  now: new Date('2026-10-31T12:00:00Z'),
}

describe('buildTodos', () => {
  it('is empty when nothing needs doing', () => {
    expect(buildTodos(quiet)).toEqual([])
  })

  it('groups work by area and links orders to a filtered list', () => {
    const todos = buildTodos({ ...quiet, received: 2, failedSends: 1 })
    expect(todos.map((t) => [t.group, t.href])).toEqual([
      ['Orders', '/orders?status=received'],
      ['Emails', '/email-log'],
    ])
    expect(todos[0].count).toBe(2)
  })

  it('asks for last month\'s statement when it is missing', () => {
    expect(buildTodos({ ...quiet, statementMonths: [] })).toEqual([
      { group: 'Finance', label: 'September 2026 statement', count: null, href: '/finance/statements' },
    ])
  })

  it('handles the turn of the year', () => {
    const todos = buildTodos({ ...quiet, statementMonths: [], now: new Date('2027-01-05T12:00:00Z') })
    expect(todos[0].label).toBe('December 2026 statement')
  })
})
