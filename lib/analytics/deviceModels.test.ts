import { describe, it, expect } from 'vitest'
import { deviceModelPerformance } from './deviceModels'

describe('deviceModelPerformance', () => {
  it('extracts the model from a "Color/Model" variant and sums units sold', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'Deep Purple/iPhone 14Pro', qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ variant: 'Cream/iPhone 14Pro', qty: 2 }] },
    ])
    expect(result).toEqual([{ model: 'iPhone 14Pro', unitsSold: 3 }])
  })

  it('treats a variant with no slash as the model itself, when it looks like a device', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'iPhone 13Promax', qty: 1 }] },
    ])
    expect(result).toEqual([{ model: 'iPhone 13Promax', unitsSold: 1 }])
  })

  it('excludes a variant with no slash that has no recognizable device model', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'Gray', qty: 1 }] },
    ])
    expect(result).toEqual([])
  })

  it('excludes items with no variant at all', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: null, qty: 1 }] },
    ])
    expect(result).toEqual([])
  })

  it('keeps a multi-model compatibility string intact rather than double-splitting', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'Brown/iPhone 13/14/15', qty: 1 }] },
    ])
    expect(result).toEqual([{ model: 'iPhone 13/14/15', unitsSold: 1 }])
  })

  it('groups models that only differ by case, using the most common casing', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'Silver/Iphone 13', qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ variant: 'Black/iPhone 13', qty: 2 }] },
      { status: 'Delivered', parsedItems: [{ variant: 'Rose/iPhone 13', qty: 3 }] },
    ])
    expect(result).toEqual([{ model: 'iPhone 13', unitsSold: 6 }])
  })

  it('excludes cancelled and returned orders', () => {
    const result = deviceModelPerformance([
      { status: 'Cancelled', parsedItems: [{ variant: 'Black/iPhone 13', qty: 1 }] },
      { status: 'Returned', parsedItems: [{ variant: 'Black/iPhone 13', qty: 1 }] },
    ])
    expect(result).toEqual([])
  })

  it('recognizes a Samsung model as well as iPhone', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'Black with logo/Samsung Galaxy S25', qty: 1 }] },
    ])
    expect(result).toEqual([{ model: 'Samsung Galaxy S25', unitsSold: 1 }])
  })

  it('sorts descending by units sold', () => {
    const result = deviceModelPerformance([
      { status: 'Delivered', parsedItems: [{ variant: 'Black/iPhone 13', qty: 1 }] },
      { status: 'Delivered', parsedItems: [{ variant: 'Black/iPhone 15', qty: 5 }] },
    ])
    expect(result).toEqual([
      { model: 'iPhone 15', unitsSold: 5 },
      { model: 'iPhone 13', unitsSold: 1 },
    ])
  })

  it('returns an empty array for no orders', () => {
    expect(deviceModelPerformance([])).toEqual([])
  })
})
