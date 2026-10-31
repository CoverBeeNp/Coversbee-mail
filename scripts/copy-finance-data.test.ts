import { describe, it, expect } from 'vitest'
import {
  normalizePhone, planCustomers, planOrders, revenueByMonth, revenueDifferences, statementsMatch,
  type Customer, type SourceOrder, type TargetOrder,
} from './copy-finance-data'

const financeCustomer = (overrides: Partial<Customer>): Customer => ({
  id: 'f1', name: 'Nees', phone: '9709956477', email: 'nees@example.com', blanxer_customer_id: 'bc-1',
  created_at: '2025-01-01T00:00:00Z', ...overrides,
})
const mailCustomer = (overrides: Partial<Customer>): Customer => ({
  id: 'm1', name: 'Nees', phone: '9709956477', email: null, blanxer_customer_id: null,
  subscribed_to_marketing: true, ...overrides,
})
const financeOrder = (overrides: Partial<SourceOrder>): SourceOrder => ({
  id: 'fo1', blanxer_id: 'bx-1', order_number: '1747', customer_id: 'f1', status: 'Delivered',
  subtotal: 799, delivery_charge: 170, total: 969, parsed_items: [], source: 'blanxer',
  created_at: '2025-06-01T00:00:00Z', ...overrides,
})
const mailOrder = (overrides: Partial<TargetOrder>): TargetOrder => ({
  id: 'mo1', blanxer_id: 'bx-1', blanxer_order_number: '1747', customer_id: 'm1', ...overrides,
})

describe('normalizePhone', () => {
  it('compares on the last ten digits', () => {
    expect(normalizePhone('+977 970-995-6477')).toBe('9709956477')
    expect(normalizePhone('')).toBeNull()
  })
})

describe('planCustomers', () => {
  it('adds a customer only in Finance as unsubscribed, keeping its id', () => {
    const plan = planCustomers([financeCustomer({})], [])
    expect(plan.inserts).toEqual([expect.objectContaining({ id: 'f1', subscribed_to_marketing: false })])
    expect(plan.idMap.get('f1')).toBe('f1')
  })

  it('maps a matched customer to its Mail id and fills only empty fields', () => {
    const plan = planCustomers([financeCustomer({ name: 'Other Name' })], [mailCustomer({})])
    expect(plan.inserts).toEqual([])
    expect(plan.idMap.get('f1')).toBe('m1')
    expect(plan.patches.get('m1')).toEqual({ blanxer_customer_id: 'bc-1', email: 'nees@example.com' })
  })

  it('never includes the subscription in a change to an existing customer', () => {
    const plan = planCustomers([financeCustomer({})], [mailCustomer({ subscribed_to_marketing: false })])
    expect(plan.patches.get('m1')).not.toHaveProperty('subscribed_to_marketing')
  })

  it('matches on phone despite different formatting', () => {
    const plan = planCustomers([financeCustomer({ phone: '+977 9709956477', email: null })], [mailCustomer({})])
    expect(plan.idMap.get('f1')).toBe('m1')
  })

  it('merges Finance customers that share a phone into one row', () => {
    const plan = planCustomers(
      [financeCustomer({}), financeCustomer({ id: 'f2', blanxer_customer_id: 'bc-2', email: null })],
      []
    )
    expect(plan.inserts).toHaveLength(1)
    expect(plan.idMap.get('f2')).toBe('f1')
  })

  it('does not assign two Blanxer ids to one customer', () => {
    const plan = planCustomers(
      [financeCustomer({}), financeCustomer({ id: 'f2', blanxer_customer_id: 'bc-2' })],
      [mailCustomer({})]
    )
    expect(plan.patches.get('m1')?.blanxer_customer_id).toBe('bc-1')
  })

  it('finds nothing to do on a re-run', () => {
    const first = planCustomers([financeCustomer({})], [])
    const second = planCustomers([financeCustomer({})], first.inserts)
    expect(second.inserts).toEqual([])
    expect(second.patches.size).toBe(0)
  })
})

describe('planOrders', () => {
  const ids = new Map([['f1', 'm1']])

  it('adds an order only in Finance outside the email workflow', () => {
    const plan = planOrders([financeOrder({})], [], ids)
    expect(plan.inserts).toEqual([
      expect.objectContaining({ id: 'fo1', status: null, blanxer_status: 'Delivered', blanxer_order_number: '1747', customer_id: 'm1' }),
    ])
  })

  it('updates a matched order without its email status, address or tracking link', () => {
    const plan = planOrders([financeOrder({})], [mailOrder({})], ids)
    expect(plan.inserts).toEqual([])
    const patch = plan.patches.get('mo1')!
    expect(patch).toMatchObject({ blanxer_status: 'Delivered', delivery_charge: 170, created_at: '2025-06-01T00:00:00Z' })
    for (const key of ['status', 'address', 'tracking_url', 'customer_id']) expect(patch).not.toHaveProperty(key)
  })

  it('can leave product lines alone on orders already in Mail', () => {
    const plan = planOrders([financeOrder({})], [mailOrder({})], ids, { keepMailItems: true })
    expect(plan.patches.get('mo1')).not.toHaveProperty('parsed_items')
    expect(plan.patches.get('mo1')).toMatchObject({ blanxer_status: 'Delivered' })
  })

  it('links a pasted order that has no blanxer_id by its number', () => {
    const plan = planOrders([financeOrder({})], [mailOrder({ blanxer_id: null })], ids)
    expect(plan.patches.get('mo1')).toMatchObject({ blanxer_id: 'bx-1' })
  })

  it('flags an order number repeated in Finance', () => {
    const plan = planOrders([financeOrder({}), financeOrder({ id: 'fo2', blanxer_id: 'bx-2' })], [], ids)
    expect(plan.conflicts).toEqual([{ orderNumber: '1747', reason: 'repeated in Finance' }])
  })

  it('flags a number that belongs to a different Blanxer order in Mail', () => {
    const plan = planOrders([financeOrder({ blanxer_id: 'bx-9' })], [mailOrder({})], ids)
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.patches.size).toBe(0)
  })

  it('counts orders that exist only in Mail', () => {
    expect(planOrders([], [mailOrder({})], ids).mailOnlyOrders).toBe(1)
  })
})

describe('revenue check', () => {
  it('excludes cancelled and returned orders and the delivery charge', () => {
    const months = revenueByMonth([
      { status: 'Delivered', total: 969, delivery_charge: 170, created_at: '2025-06-01T00:00:00Z' },
      { status: 'Cancelled', total: 500, delivery_charge: 0, created_at: '2025-06-02T00:00:00Z' },
      { status: 'Returned', total: 500, delivery_charge: 0, created_at: '2025-06-03T00:00:00Z' },
    ])
    expect(months.get('2025-06')).toBe(799)
  })

  it('reports months that differ', () => {
    expect(revenueDifferences(new Map([['2025-06', 100]]), new Map([['2025-06', 100], ['2025-07', 5]]))).toEqual([
      { month: '2025-07', source: 0, target: 5 },
    ])
  })
})

describe('statementsMatch', () => {
  it('ignores column order but catches a changed figure', () => {
    expect(statementsMatch([{ id: 1, month: '2026-08', revenue: 5 }], [{ revenue: 5, month: '2026-08', id: 1 }])).toEqual([])
    expect(statementsMatch([{ id: 1, month: '2026-08', revenue: 5 }], [{ id: 1, month: '2026-08', revenue: 6 }])).toEqual(['2026-08'])
  })
})
