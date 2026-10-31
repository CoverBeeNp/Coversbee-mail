import { describe, it, expect } from 'vitest'
import { mapBlanxerOrder } from './mapOrder'
import type { BlanxerApiOrderDetail } from './types'

const CREATED_AT = '2026-08-05T10:15:00.000Z'

function baseDetail(overrides: Partial<BlanxerApiOrderDetail> = {}): BlanxerApiOrderDetail {
  return {
    _id: 'order-1',
    order_number: 1723,
    status: 'Delivered',
    customer: 'customer-1',
    customer_full_name: 'Nidip Pant',
    customer_email: '',
    customer_phone_number: '9803732536',
    delivery_charge: 170,
    product_total_price: 799,
    ordered_products: [
      { product_name: 'Silicon', variant_name: 'Deep Purple', price: 799, quantity: 1 },
    ],
    discount: { d_value: 0, d_type: 1 },
    ...overrides,
  }
}

describe('mapBlanxerOrder', () => {
  it('maps fields and computes total as subtotal + delivery - discount', () => {
    const result = mapBlanxerOrder(baseDetail(), CREATED_AT)
    expect(result).toEqual({
      blanxerId: 'order-1',
      blanxerCustomerId: 'customer-1',
      orderNumber: '1723',
      status: 'Delivered',
      createdAt: CREATED_AT,
      blanxerUpdatedAt: null,
      items: [{ name: 'Silicon', color: null, variant: 'Deep Purple', unitPrice: 799, qty: 1, lineTotal: 799 }],
      subtotal: 799,
      deliveryCharge: 170,
      total: 969,
      customerName: 'Nidip Pant',
      customerEmail: null,
      customerPhone: '9803732536',
      address: null,
      trackingUrl: null,
    })
  })

  it('maps the delivery address and tracking link', () => {
    const result = mapBlanxerOrder(
      baseDetail({
        customer_address: 'Dulal chowk, Kapan',
        customer_address_landmark: 'Near the temple',
        customer_address_city: 'Kathmandu',
        customer_address_province: '',
        shipment_tracking: 'https://coversbee.com.np/track/abc',
      }),
      CREATED_AT
    )
    expect(result.address).toBe('Dulal chowk, Kapan, Near the temple, Kathmandu')
    expect(result.trackingUrl).toBe('https://coversbee.com.np/track/abc')
  })

  it('carries the order-list created_at through to the mapped order', () => {
    const result = mapBlanxerOrder(baseDetail(), '2024-01-31T23:59:59.000Z')
    expect(result.createdAt).toBe('2024-01-31T23:59:59.000Z')
  })

  it('treats a flat discount (d_type 1) as a currency amount', () => {
    const result = mapBlanxerOrder(baseDetail({ discount: { d_value: 100, d_type: 1 } }), CREATED_AT)
    expect(result.total).toBe(869) // 799 + 170 - 100
  })

  it('treats a percent discount (d_type 2) as a percentage of the product subtotal', () => {
    const result = mapBlanxerOrder(baseDetail({ discount: { d_value: 10, d_type: 2 } }), CREATED_AT)
    expect(result.total).toBe(889.1) // 799 + 170 - (799 * 0.10)
  })

  it('never returns a negative total', () => {
    const result = mapBlanxerOrder(baseDetail({ discount: { d_value: 10000, d_type: 1 } }), CREATED_AT)
    expect(result.total).toBe(0)
  })

  it('sums multiple items and subtracts per-item discount from line totals', () => {
    const result = mapBlanxerOrder(
      baseDetail({
        product_total_price: 1598,
        ordered_products: [
          { product_name: 'Silicon', price: 799, quantity: 2, discount_amount: 50 },
        ],
      }),
      CREATED_AT
    )
    expect(result.items).toEqual([{ name: 'Silicon', color: null, variant: null, unitPrice: 799, qty: 2, lineTotal: 1548 }])
  })

  it('splits a "Color/Model" variant into separate color and model fields, matching Blanxer\'s own format', () => {
    const result = mapBlanxerOrder(
      baseDetail({ ordered_products: [{ product_name: 'Silicon', variant_name: 'Deep Purple/iPhone 14Pro', price: 799, quantity: 1 }] }),
      CREATED_AT
    )
    expect(result.items).toEqual([{ name: 'Silicon', color: 'Deep Purple', variant: 'iPhone 14Pro', unitPrice: 799, qty: 1, lineTotal: 799 }])
  })

  it('keeps a multi-slash compatibility variant intact as the model, splitting only on the first slash', () => {
    const result = mapBlanxerOrder(
      baseDetail({ ordered_products: [{ product_name: 'Silicon', variant_name: 'Brown/iPhone 13/14/15', price: 799, quantity: 1 }] }),
      CREATED_AT
    )
    expect(result.items).toEqual([{ name: 'Silicon', color: 'Brown', variant: 'iPhone 13/14/15', unitPrice: 799, qty: 1, lineTotal: 799 }])
  })

  it('subtracts both the order-level discount and every per-item discount from the total', () => {
    const result = mapBlanxerOrder(
      baseDetail({
        delivery_charge: 0,
        product_total_price: 1598,
        discount: { d_value: 100, d_type: 1 },
        ordered_products: [
          { product_name: 'Silicon', price: 799, quantity: 1, discount_amount: 50 },
          { product_name: 'Glass', price: 799, quantity: 1, discount_amount: 25 },
        ],
      }),
      CREATED_AT
    )
    // 1598 + 0 - 100 (order discount) - 75 (item discounts) = 1423,
    // which equals the summed line totals (749 + 774) minus the order discount.
    expect(result.total).toBe(1423)
    expect(result.items.reduce((sum, i) => sum + i.lineTotal, 0)).toBe(1523)
  })

  it('falls back to null for missing customer fields', () => {
    const result = mapBlanxerOrder(baseDetail({ customer_full_name: '', customer: '' }), CREATED_AT)
    expect(result.customerName).toBeNull()
    expect(result.blanxerCustomerId).toBeNull()
  })

  it('throws on a malformed detail rather than producing NaN totals', () => {
    expect(() =>
      mapBlanxerOrder(baseDetail({ ordered_products: undefined as unknown as [] }), CREATED_AT)
    ).toThrow('Malformed Blanxer order detail for order order-1')
    expect(() =>
      mapBlanxerOrder(baseDetail({ product_total_price: undefined as unknown as number }), CREATED_AT)
    ).toThrow('Malformed Blanxer order detail for order order-1')
  })
})
