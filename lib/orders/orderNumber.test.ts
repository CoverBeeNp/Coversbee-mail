import { describe, it, expect } from 'vitest'
import { nextOrderNumber } from './orderNumber'

describe('nextOrderNumber', () => {
  it('increments the highest existing number by one', () => {
    expect(nextOrderNumber(['ORD-0001', 'ORD-0054', 'ORD-0032'])).toBe('ORD-0055')
  })

  it('pads to four digits', () => {
    expect(nextOrderNumber(['ORD-0007'])).toBe('ORD-0008')
  })

  it('starts at ORD-0001 when there are no existing orders', () => {
    expect(nextOrderNumber([])).toBe('ORD-0001')
  })

  it('grows past four digits once the count exceeds it, rather than truncating', () => {
    expect(nextOrderNumber(['ORD-9999'])).toBe('ORD-10000')
  })

  it('ignores order numbers with no trailing digits', () => {
    expect(nextOrderNumber(['ORD-0010', 'MISC'])).toBe('ORD-0011')
  })
})
