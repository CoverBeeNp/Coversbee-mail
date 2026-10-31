import { describe, it, expect } from 'vitest'
import { parseCustomerDetails } from './blanxerParser'

describe('parseCustomerDetails', () => {
  it('extracts name, email, and phone from a pasted "Customer Details" block', () => {
    const pasted = `Customer Details

Name:

Nees shah

Email:

grgbini898@gmail.com

Phone Number:

9709956477
`
    expect(parseCustomerDetails(pasted)).toEqual({
      name: 'Nees shah',
      email: 'grgbini898@gmail.com',
      phone: '9709956477',
    })
  })

  it('works without blank lines between label and value too', () => {
    const pasted = `Name:\nNees shah\nEmail:\ngrgbini898@gmail.com\nPhone Number:\n9709956477`
    expect(parseCustomerDetails(pasted)).toEqual({
      name: 'Nees shah',
      email: 'grgbini898@gmail.com',
      phone: '9709956477',
    })
  })

  it('leaves fields null instead of guessing when they are missing', () => {
    expect(parseCustomerDetails('not a customer details block')).toEqual({ name: null, email: null, phone: null })
  })
})
