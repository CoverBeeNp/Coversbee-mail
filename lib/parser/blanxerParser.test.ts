import { describe, it, expect } from 'vitest'
import { parseBlanxerOrder, formatAddress } from './blanxerParser'

const sample = `#1747
Created: Aug 20, 2026 2:50 AM
Modified: Aug 20, 2026 8:25 AM
Tracking URL:
https://coversbee.com.np/track/6a86b1ab454b1a6bfa9d2c73
Status:
Delivery_Transit
&
Unpaid
Payment Method: COD
Created By: Yaman Subedi

Order Summary
Cart Items
1
SIlicon
Variant: Old Rose/iPhone 13
रू 799 x 1
रू 799
1
SIlicon
Variant: Old Rose/iPhone 13Promax
रू 799 x 1
रू 799
Sub-total
रू 1,598
Delivery Charge
रू 170
Total
रू 1,768

Customer Details
Name:
Nees shah
Email:
grgbini898@gmail.com
Phone Number:
9709956477
Province:
City:
Kathmandu Inside Ring Road
Address:
Dulal chowk, Kapan
Landmark:
Order Note:
`

describe('parseBlanxerOrder', () => {
  it('extracts order number, items, totals, and customer fields', () => {
    const result = parseBlanxerOrder(sample)
    expect(result.blanxerOrderNumber).toBe('1747')
    expect(result.items).toEqual([
      { name: 'SIlicon', variant: 'Old Rose/iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 },
      { name: 'SIlicon', variant: 'Old Rose/iPhone 13Promax', unitPrice: 799, qty: 1, lineTotal: 799 },
    ])
    expect(result.subtotal).toBe(1598)
    expect(result.deliveryCharge).toBe(170)
    expect(result.total).toBe(1768)
    expect(result.customerName).toBe('Nees shah')
    expect(result.customerEmail).toBe('grgbini898@gmail.com')
    expect(result.customerPhone).toBe('9709956477')
    expect(result.city).toBe('Kathmandu Inside Ring Road')
    expect(result.address).toBe('Dulal chowk, Kapan')
    expect(result.trackingUrl).toBe('https://coversbee.com.np/track/6a86b1ab454b1a6bfa9d2c73')
  })

  it('leaves blank customer fields blank instead of guessing', () => {
    const result = parseBlanxerOrder(sample)
    expect(result.province).toBeNull()
    expect(result.landmark).toBeNull()
    expect(result.orderNote).toBeNull()
  })

  it('flags unmatched required fields when the paste is garbled', () => {
    const result = parseBlanxerOrder('this is not a valid blanxer paste at all')
    expect(result.customerName).toBeNull()
    expect(result.total).toBeNull()
    expect(result.unmatchedFields).toEqual(expect.arrayContaining(['customerName', 'total']))
  })

  it('extracts the same fields when the browser copy-paste inserts blank lines between every field', () => {
    // Real browser copy-paste of the rendered Blanxer order page (as opposed
    // to a hand-typed/HTML-source version) inserts a blank line between
    // every label and its value, and between every other visually-separated
    // block — reproduced here from an actual staff paste that failed to
    // parse in production.
    const spacedSample = `#1747
Created: Aug 20, 2026 2:50 AM

Modified: Aug 21, 2026 2:52 AM

Tracking URL:

https://coversbee.com.np/track/6a86b1ab454b1a6bfa9d2c73
Status:
Delivered
&
Paid
Payment Method: COD

Created By: Yaman Subedi

Order Summary

Cart Items

1
SIlicon

Variant: Old Rose/iPhone 13

रू 799 x 1

रू 799

1
SIlicon

Variant: Old Rose/iPhone 13Promax

रू 799 x 1

रू 799

Sub-total

रू 1,598

Delivery Charge

रू 170

Total

रू 1,768

Customer Details

Name:

Nees shah

Email:

grgbini898@gmail.com

Phone Number:

9709956477

Province:

City:

Kathmandu Inside Ring Road

Address:

Dulal chowk, Kapan

Landmark:

Order Note:
`
    const result = parseBlanxerOrder(spacedSample)
    expect(result.blanxerOrderNumber).toBe('1747')
    expect(result.items).toEqual([
      { name: 'SIlicon', variant: 'Old Rose/iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 },
      { name: 'SIlicon', variant: 'Old Rose/iPhone 13Promax', unitPrice: 799, qty: 1, lineTotal: 799 },
    ])
    expect(result.subtotal).toBe(1598)
    expect(result.deliveryCharge).toBe(170)
    expect(result.total).toBe(1768)
    expect(result.customerName).toBe('Nees shah')
    expect(result.customerEmail).toBe('grgbini898@gmail.com')
    expect(result.customerPhone).toBe('9709956477')
    expect(result.province).toBeNull()
    expect(result.city).toBe('Kathmandu Inside Ring Road')
    expect(result.address).toBe('Dulal chowk, Kapan')
    expect(result.landmark).toBeNull()
    expect(result.orderNote).toBeNull()
    expect(result.trackingUrl).toBe('https://coversbee.com.np/track/6a86b1ab454b1a6bfa9d2c73')
    expect(result.unmatchedFields).toEqual([])
  })
})

describe('formatAddress', () => {
  it('joins the non-null address parts with commas', () => {
    expect(formatAddress({ address: 'Dulal chowk, Kapan', landmark: null, city: 'Kathmandu', province: null })).toBe(
      'Dulal chowk, Kapan, Kathmandu'
    )
  })

  it('returns null when every part is null', () => {
    expect(formatAddress({ address: null, landmark: null, city: null, province: null })).toBeNull()
  })

  it('includes landmark and province when present', () => {
    expect(
      formatAddress({ address: 'Dulal chowk, Kapan', landmark: 'Near temple', city: 'Kathmandu', province: 'Bagmati' })
    ).toBe('Dulal chowk, Kapan, Near temple, Kathmandu, Bagmati')
  })
})
