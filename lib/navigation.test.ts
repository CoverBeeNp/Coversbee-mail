import { describe, it, expect } from 'vitest'
import { activeHref } from './navigation'

describe('activeHref', () => {
  it.each([
    ['/overview', '/overview'],
    ['/orders/abc', '/orders'],
    ['/finance', '/finance'],
    ['/finance/orders', '/finance/orders'],
    ['/finance/expenses', '/finance/expenses'],
    ['/finance/expenses/abc/edit', '/finance/expenses'],
    ['/finance/expenses/categories', '/finance/expenses/categories'],
    ['/finance/statements/2026-09', '/finance/statements'],
  ])('%s activates %s only', (pathname, expected) => {
    expect(activeHref(pathname)).toBe(expected)
  })

  it('does not match a path that merely starts with the same letters', () => {
    expect(activeHref('/ordersarchive')).toBeUndefined()
  })
})
