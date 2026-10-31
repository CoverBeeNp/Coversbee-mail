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

  it('puts failed emails first and links orders to a filtered list', () => {
    const todos = buildTodos({ ...quiet, received: 2, failedSends: 1 })
    expect(todos.map((t) => t.href)).toEqual(['/email-log', '/orders?status=received'])
    expect(todos[0].detail).toBe('1 email failed in the last 30 days')
    expect(todos[1].detail).toBe('2 orders waiting to be sent out')
  })

  it('asks for last month\'s statement when it is missing', () => {
    const todos = buildTodos({ ...quiet, statementMonths: [] })
    expect(todos).toEqual([expect.objectContaining({ label: 'Generate the September 2026 statement', href: '/finance/statements' })])
  })

  it('handles the turn of the year', () => {
    const todos = buildTodos({ ...quiet, statementMonths: [], now: new Date('2027-01-05T12:00:00Z') })
    expect(todos[0].label).toBe('Generate the December 2026 statement')
  })
})
