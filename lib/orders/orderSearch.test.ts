import { describe, it, expect } from 'vitest'
import { cleanSearchText, customerSearchFilter, orderSearchFilter } from './orderSearch'

describe('cleanSearchText', () => {
  it('drops characters PostgREST treats as syntax', () => {
    expect(cleanSearchText(' #1931, (a)"b" ')).toBe('1931 ab')
  })

  it('keeps what names, phones, emails and order numbers use', () => {
    expect(cleanSearchText('Sita Rai')).toBe('Sita Rai')
    expect(cleanSearchText('+977-98')).toBe('+977-98')
    expect(cleanSearchText('a.b@x.com')).toBe('a.b@x.com')
    expect(cleanSearchText('ORD-1042')).toBe('ORD-1042')
  })

  it('keeps letters outside English', () => {
    expect(cleanSearchText('सीता')).toBe('सीता')
  })
})

describe('customerSearchFilter', () => {
  it('matches name, phone or email', () => {
    expect(customerSearchFilter('98')).toBe('name.ilike."%98%",phone.ilike."%98%",email.ilike."%98%"')
  })
})

describe('orderSearchFilter', () => {
  it('matches the order number alone when no customer matched', () => {
    expect(orderSearchFilter('19', [])).toBe('blanxer_order_number.ilike."%19%"')
  })

  it('also matches orders of the customers found', () => {
    expect(orderSearchFilter('ram', ['a', 'b'])).toBe('blanxer_order_number.ilike."%ram%",customer_id.in.(a,b)')
  })
})
