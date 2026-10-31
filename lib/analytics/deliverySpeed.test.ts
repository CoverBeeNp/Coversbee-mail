import { describe, it, expect } from 'vitest'
import { deliverySpeed, lateOrders } from './deliverySpeed'

const order = (status: string | null, createdAt: string, deliveredAt: string | null = null, id = 'o') => ({
  id,
  orderNumber: '1',
  status,
  createdAt,
  deliveredAt,
})

describe('deliverySpeed', () => {
  it('reports the median and 90th percentile, unmoved by one very slow order', () => {
    const quick = Array.from({ length: 9 }, () => order('Delivered', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z'))
    const result = deliverySpeed([...quick, order('Delivered', '2026-09-01T00:00:00Z', '2026-12-01T00:00:00Z')])
    expect(result.medianDays).toBe(2)
    expect(result.p90Days).toBe(91)
    expect(result.measured).toBe(10)
  })

  it('groups by the month the order was placed', () => {
    const orders = Array.from({ length: 10 }, () => order('Delivered', '2026-08-31T00:00:00Z', '2026-09-02T00:00:00Z'))
    expect(deliverySpeed(orders).months).toEqual([{ month: '2026-08', medianDays: 2, orders: 10 }])
  })

  it('leaves thin months off the chart but keeps them in the overall figures', () => {
    const result = deliverySpeed([order('Delivered', '2025-08-01T00:00:00Z', '2025-12-01T00:00:00Z')])
    expect(result.months).toEqual([])
    expect(result.measured).toBe(1)
  })

  it('skips orders not delivered, with no date, or with impossible dates', () => {
    const result = deliverySpeed([
      order('Returned', '2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'),
      order('Delivered', '2026-09-01T00:00:00Z'),
      order('Delivered', '2026-09-05T00:00:00Z', '2026-09-01T00:00:00Z'),
    ])
    expect(result).toEqual({ months: [], medianDays: null, p90Days: null, measured: 0 })
  })
})

describe('lateOrders', () => {
  const now = new Date('2026-10-31T00:00:00Z')

  it('lists open orders past the limit, oldest first', () => {
    const late = lateOrders(
      [
        order('Processing', '2026-10-20T00:00:00Z', null, 'newer'),
        order('Waiting Pickup', '2026-10-01T00:00:00Z', null, 'older'),
        order('Processing', '2026-10-30T00:00:00Z', null, 'fine'),
      ],
      now
    )
    expect(late.map((o) => o.id)).toEqual(['older', 'newer'])
    expect(late[0].ageDays).toBe(30)
  })

  it('leaves out finished orders', () => {
    const finished = ['Delivered', 'Cancelled', 'Returned', null].map((s) => order(s, '2026-01-01T00:00:00Z'))
    expect(lateOrders(finished, now)).toEqual([])
  })
})
