import { describe, it, expect } from 'vitest'
import { productPerformance } from './products'

describe('productPerformance', () => {
  it('sums line totals and quantities per product name across orders', () => {
    const result = productPerformance([
      { status: 'Delivered', parsedItems: [{ name: 'Silicon Case', lineTotal: 799, qty: 1 }] },
      {
        status: 'Delivered',
        parsedItems: [
          { name: 'Silicon Case', lineTotal: 799, qty: 1 },
          { name: 'Screen Protector', lineTotal: 199, qty: 2 },
        ],
      },
    ])
    expect(result).toEqual([
      { name: 'Silicon Case', revenue: 1598, unitsSold: 2 },
      { name: 'Screen Protector', revenue: 199, unitsSold: 2 },
    ])
  })

  it('excludes cancelled orders', () => {
    const result = productPerformance([
      { status: 'Cancelled', parsedItems: [{ name: 'Silicon Case', lineTotal: 799, qty: 1 }] },
    ])
    expect(result).toEqual([])
  })

  it('excludes returned (refunded) orders', () => {
    const result = productPerformance([
      { status: 'Returned', parsedItems: [{ name: 'Silicon Case', lineTotal: 799, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ name: 'Silicon Case', lineTotal: 799, qty: 1 }] },
    ])
    expect(result).toEqual([{ name: 'Silicon Case', revenue: 799, unitsSold: 1 }])
  })

  it('returns an empty array for no orders', () => {
    expect(productPerformance([])).toEqual([])
  })

  it('groups names that only differ by case, using the most common casing for display', () => {
    const result = productPerformance([
      { status: 'Delivered', parsedItems: [{ name: 'SIlicon', lineTotal: 100, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ name: 'Silicon', lineTotal: 200, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ name: 'silicon', lineTotal: 300, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ name: 'Silicon', lineTotal: 400, qty: 1 }] },
    ])
    expect(result).toEqual([{ name: 'Silicon', revenue: 1000, unitsSold: 4 }])
  })

  it('trims whitespace before grouping, so a stray trailing space does not split a product in two', () => {
    const result = productPerformance([
      { status: 'Delivered', parsedItems: [{ name: 'Desert ', lineTotal: 100, qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ name: 'Desert', lineTotal: 200, qty: 1 }] },
    ])
    expect(result).toEqual([{ name: 'Desert', revenue: 300, unitsSold: 2 }])
  })
})
