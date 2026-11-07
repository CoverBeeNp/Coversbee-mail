import { describe, it, expect } from 'vitest'
import { activeHref } from './navigation'

describe('activeHref', () => {
  it.each([
    ['/overview', '/overview'],
    ['/orders/abc', '/orders'],
    ['/finance', '/finance'],
    ['/orders/outside-blanxer', '/orders/outside-blanxer'],
    ['/customers', '/customers'],
    ['/customers/retain', '/customers/retain'],
    ['/finance/expenses', '/finance/expenses'],
    ['/finance/expenses/abc/edit', '/finance/expenses'],
    ['/finance/expenses/categories', '/finance/expenses/categories'],
    ['/finance/statements/2026-09', '/finance/statements'],
    ['/social/instagram', '/social/instagram'],
  ])('%s activates %s only', (pathname, expected) => {
    expect(activeHref(pathname)).toBe(expected)
  })

  it('does not match a path that merely starts with the same letters', () => {
    expect(activeHref('/ordersarchive')).toBeUndefined()
  })
})
