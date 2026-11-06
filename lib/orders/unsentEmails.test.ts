import { describe, it, expect } from 'vitest'
import { ordersMissingEmail } from './unsentEmails'

describe('ordersMissingEmail', () => {
  it('lists orders whose current status email was never sent', () => {
    const orders = [
      { id: 'a', status: 'delivered' as const, blanxerStatus: 'Delivered' },
      { id: 'b', status: 'dispatched' as const, blanxerStatus: 'Dispatched' },
    ]
    const sent = [{ orderId: 'b', template: 'dispatched' }]
    expect(ordersMissingEmail(orders, sent)).toEqual(['a'])
  })

  it('ignores emails for an earlier status', () => {
    const orders = [{ id: 'a', status: 'delivered' as const, blanxerStatus: 'Delivered' }]
    expect(ordersMissingEmail(orders, [{ orderId: 'a', template: 'dispatched' }])).toEqual(['a'])
  })

  it('leaves out returned orders, which show as cancelled', () => {
    const orders = [
      { id: 'a', status: 'cancelled' as const, blanxerStatus: 'Returned' },
      { id: 'b', status: 'cancelled' as const, blanxerStatus: 'Cancelled' },
    ]
    expect(ordersMissingEmail(orders, [])).toEqual(['b'])
  })

  it('leaves out received orders', () => {
    const orders = [{ id: 'a', status: 'received' as const, blanxerStatus: 'Processing' }]
    expect(ordersMissingEmail(orders, [])).toEqual([])
  })
})
