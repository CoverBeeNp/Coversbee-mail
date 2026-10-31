/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory supabase stand-in */
import { describe, it, expect, beforeEach } from 'vitest'
import { saveOrder } from './saveOrder'
import type { MappedOrder } from '@/lib/blanxer/mapOrder'

type Row = Record<string, any>
let tables: { customers: Row[]; orders: Row[] }
let writes: { table: string; kind: 'insert' | 'update'; values: Row }[]

// Just enough of the query builder for saveOrder, working on in-memory rows so
// tests assert on stored results and on exactly which fields were written.
function fakeSupabase(): any {
  const query = (table: 'customers' | 'orders') => {
    const filters: ((r: Row) => boolean)[] = []
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)))
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push((r) => r[column] === value); return builder },
      is: (column: string, value: unknown) => { filters.push((r) => (r[column] ?? null) === value); return builder },
      order: () => builder,
      limit: async (n: number) => ({ data: rows().slice(0, n), error: null }),
      maybeSingle: async () => {
        const found = rows()
        if (found.length > 1) return { data: null, error: new Error('multiple rows') }
        return { data: found[0] ?? null, error: null }
      },
    }
    return builder
  }
  return {
    from: (table: 'customers' | 'orders') => ({
      select: () => query(table),
      insert: (values: Row) => {
        writes.push({ table, kind: 'insert', values })
        const row = { id: `${table}-${tables[table].length + 1}`, ...values }
        tables[table].push(row)
        const result = { data: row, error: null }
        return { select: () => ({ single: async () => result }), then: (resolve: any) => resolve(result) }
      },
      update: (values: Row) => ({
        eq: async (_column: string, id: string) => {
          writes.push({ table, kind: 'update', values })
          Object.assign(tables[table].find((r) => r.id === id)!, values)
          return { error: null }
        },
      }),
    }),
  }
}

function order(overrides: Partial<MappedOrder> = {}): MappedOrder {
  return {
    blanxerId: 'bx-1',
    blanxerCustomerId: 'bc-1',
    orderNumber: '1747',
    status: 'Delivered',
    createdAt: '2026-08-20T02:50:00.000Z',
    blanxerUpdatedAt: '2026-08-21T00:00:00.000Z',
    items: [{ name: 'Silicon', color: 'Rose', variant: 'iPhone 13', unitPrice: 799, qty: 1, lineTotal: 799 }],
    subtotal: 799,
    deliveryCharge: 170,
    total: 969,
    customerName: 'Nees',
    customerEmail: 'nees@example.com',
    customerPhone: '9709956477',
    address: 'Kapan, Kathmandu',
    trackingUrl: 'https://coversbee.com.np/track/abc',
    ...overrides,
  }
}

describe('saveOrder', () => {
  beforeEach(() => {
    tables = { customers: [], orders: [] }
    writes = []
  })

  it('inserts a new order with its Blanxer data and a status matching Blanxer', async () => {
    expect(await saveOrder(fakeSupabase(), order())).toBe('inserted')
    expect(tables.orders[0]).toMatchObject({
      status: 'delivered',
      blanxer_status: 'Delivered',
      blanxer_updated_at: '2026-08-21T00:00:00.000Z',
      source: 'blanxer',
      blanxer_order_number: '1747',
      subtotal: 799,
      delivery_charge: 170,
      total: 969,
      created_at: '2026-08-20T02:50:00.000Z',
      address: 'Kapan, Kathmandu',
    })
  })

  it('marks an order delivered when Blanxer says so, with no email involved', async () => {
    tables.orders.push({ id: 'o1', blanxer_id: 'bx-1', status: 'received', blanxer_status: 'Processing', customer_id: 'c1' })
    expect(await saveOrder(fakeSupabase(), order())).toBe('updated')
    expect(tables.orders[0]).toMatchObject({ status: 'delivered', blanxer_status: 'Delivered' })
    expect(tables.orders[0].status_updated_at).toBeTruthy()
  })

  it('keeps a status email sent ahead of Blanxer', async () => {
    tables.orders.push({ id: 'o1', blanxer_id: 'bx-1', status: 'dispatched', blanxer_status: 'Processing', customer_id: 'c1' })
    await saveOrder(fakeSupabase(), order({ status: 'Processing' }))
    expect(tables.orders[0].status).toBe('dispatched')
    expect(writes.find((w) => w.table === 'orders')!.values).not.toHaveProperty('status')
  })

  it('keeps a historical order outside the email workflow', async () => {
    tables.orders.push({ id: 'o1', blanxer_id: 'bx-1', status: null, customer_id: 'c1' })
    await saveOrder(fakeSupabase(), order())
    expect(tables.orders[0]).toMatchObject({ status: null, blanxer_status: 'Delivered' })
  })

  it('links an order that has a number but no blanxer_id instead of duplicating it', async () => {
    tables.orders.push({ id: 'o1', blanxer_id: null, blanxer_order_number: '1747', status: 'received', customer_id: 'c1' })
    expect(await saveOrder(fakeSupabase(), order())).toBe('updated')
    expect(tables.orders).toHaveLength(1)
    expect(tables.orders[0].blanxer_id).toBe('bx-1')
  })

  it('does not blank a stored address or tracking link when Blanxer sends none', async () => {
    tables.orders.push({ id: 'o1', blanxer_id: 'bx-1', status: 'received', address: 'Kapan', tracking_url: 'https://t', customer_id: 'c1' })
    await saveOrder(fakeSupabase(), order({ address: null, trackingUrl: null }))
    expect(tables.orders[0]).toMatchObject({ address: 'Kapan', tracking_url: 'https://t' })
  })

  it('matches a customer by phone, fills only empty fields and links the Blanxer id', async () => {
    tables.customers.push({ id: 'c1', name: 'Staff Edited', phone: '9709956477', email: null, blanxer_customer_id: null, subscribed_to_marketing: false })
    await saveOrder(fakeSupabase(), order())
    expect(tables.customers).toHaveLength(1)
    expect(tables.customers[0]).toMatchObject({
      name: 'Staff Edited',
      email: 'nees@example.com',
      blanxer_customer_id: 'bc-1',
    })
  })

  it('never changes a customer\'s marketing subscription', async () => {
    tables.customers.push({ id: 'c1', name: 'Unknown', phone: '9709956477', email: null, blanxer_customer_id: null, subscribed_to_marketing: false })
    await saveOrder(fakeSupabase(), order())
    expect(tables.customers[0].subscribed_to_marketing).toBe(false)
    for (const write of writes.filter((w) => w.table === 'customers')) {
      expect(write.values).not.toHaveProperty('subscribed_to_marketing')
    }
  })

  it('prefers the Blanxer customer id over a phone match', async () => {
    tables.customers.push(
      { id: 'by-phone', name: 'A', phone: '9709956477', email: 'a@example.com', blanxer_customer_id: null },
      { id: 'by-blanxer', name: 'B', phone: null, email: 'b@example.com', blanxer_customer_id: 'bc-1' }
    )
    await saveOrder(fakeSupabase(), order())
    expect(tables.orders[0].customer_id).toBe('by-blanxer')
  })

  it('does not fail when two customers share a phone number', async () => {
    tables.customers.push(
      { id: 'c1', name: 'A', phone: '9709956477', email: 'a@example.com', blanxer_customer_id: null },
      { id: 'c2', name: 'B', phone: '9709956477', email: 'b@example.com', blanxer_customer_id: null }
    )
    await expect(saveOrder(fakeSupabase(), order())).resolves.toBe('inserted')
    expect(tables.orders[0].customer_id).toBe('c1')
  })

  it('saves an order with no customer details at all', async () => {
    await saveOrder(fakeSupabase(), order({ blanxerCustomerId: null, customerPhone: null, customerEmail: null, customerName: null }))
    expect(tables.customers).toHaveLength(0)
    expect(tables.orders[0].customer_id).toBeNull()
  })
})
