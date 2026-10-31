import { describe, it, expect } from 'vitest'
import { workflowStatusFromBlanxer as next } from './workflowStatus'

describe('workflowStatusFromBlanxer', () => {
  it('marks an order delivered when Blanxer says so, from any status', () => {
    for (const current of ['received', 'dispatched', 'out_for_delivery', 'cancelled'] as const) {
      expect(next(current, 'Delivered')).toBe('delivered')
    }
  })

  it('applies cancelled and returned from any status', () => {
    expect(next('dispatched', 'Cancelled')).toBe('cancelled')
    expect(next('delivered', 'Returned')).toBe('cancelled')
  })

  it.each([
    ['received', 'Dispatched', 'dispatched'],
    ['received', 'Delivery_Warehouse', 'dispatched'],
    ['received', 'Delivery_Transit', 'dispatched'],
    ['dispatched', 'Delivery_Today', 'out_for_delivery'],
  ] as const)('moves %s forward on %s', (current, blanxer, expected) => {
    expect(next(current, blanxer)).toBe(expected)
  })

  it('keeps a status email sent ahead of Blanxer', () => {
    expect(next('dispatched', 'Processing')).toBe('dispatched')
    expect(next('out_for_delivery', 'Delivery_Transit')).toBe('out_for_delivery')
  })

  it('reopens a final status when Blanxer has moved the order on', () => {
    expect(next('cancelled', 'Processing')).toBe('received')
    expect(next('delivered', 'Delivery_Transit')).toBe('dispatched')
  })

  it('leaves orders outside the workflow alone', () => {
    expect(next(null, 'Delivered')).toBeNull()
  })

  it('ignores a status it does not recognise', () => {
    expect(next('dispatched', 'Something_New')).toBe('dispatched')
  })
})
