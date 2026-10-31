import { describe, it, expect } from 'vitest'
import { colorPerformance } from './colorPerformance'

describe('colorPerformance', () => {
  it('sums line totals and quantities per color across orders', () => {
    const result = colorPerformance([
      { status: 'Delivered', parsedItems: [{ color: 'Brown', lineTotal: 639, qty: 1 }] },
      {
        status: 'Delivered',
        parsedItems: [
          { color: 'Brown', lineTotal: 639, qty: 1 },
          { color: 'Blue', lineTotal: 789, qty: 2 },
        ],
      },
    ])
    expect(result).toEqual([
      { color: 'Brown', revenue: 1278, unitsSold: 2 },
      { color: 'Blue', revenue: 789, unitsSold: 2 },
    ])
  })

  it('excludes an item with no recognized color rather than lumping it into a bucket', () => {
    const result = colorPerformance([
      { status: 'Delivered', parsedItems: [{ color: null, lineTotal: 500, qty: 1 }] },
    ])
    expect(result).toEqual([])
  })

  it('groups colors that only differ by case, using the most common casing', () => {
    const result = colorPerformance([
      { status: 'Delivered', parsedItems: [{ color: 'brown', lineTotal: 100, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ color: 'Brown', lineTotal: 200, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ color: 'Brown', lineTotal: 300, qty: 1 }] },
    ])
    expect(result).toEqual([{ color: 'Brown', revenue: 600, unitsSold: 3 }])
  })

  it('excludes cancelled and returned orders', () => {
    const result = colorPerformance([
      { status: 'Cancelled', parsedItems: [{ color: 'Brown', lineTotal: 639, qty: 1 }] },
      { status: 'Returned', parsedItems: [{ color: 'Brown', lineTotal: 639, qty: 1 }] },
    ])
    expect(result).toEqual([])
  })

  it('returns an empty array for no orders', () => {
    expect(colorPerformance([])).toEqual([])
  })
})
