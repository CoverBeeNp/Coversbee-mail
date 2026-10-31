import { describe, it, expect, vi, beforeEach } from 'vitest'

const orderListRow = {
  id: 'o1',
  order_number: 'ORD-0001',
  status: 'Delivered',
  total: 839,
  parsed_items: [{ name: 'Half Butterfly', color: 'Purple', variant: 'iPhone 16Promax', qty: 1, lineTotal: 839, unitPrice: 839 }],
  created_at: '2025-04-04T19:43:00.000Z',
  customer: { name: 'Nisma Parajuli', phone: '9845948957' },
}

// Both listManualOrders and createManualOrder's uniqueness check start with
// orders.select(...).eq(...) — the branch after that differs (.order() for
// the list, .maybeSingle() for the uniqueness check), so one shared `eq`
// mock exposing both is simpler than guessing which call site is which.
const ordersOrder = vi.fn()
const ordersMaybeSingle = vi.fn()
const ordersLte = vi.fn()
const ordersGte = vi.fn(() => ({ lte: ordersLte }))
const ordersEq = vi.fn(() => ({ order: ordersOrder, maybeSingle: ordersMaybeSingle, gte: ordersGte }))
const ordersSelect = vi.fn(() => ({ eq: ordersEq }))

const orderInsertSingle = vi.fn()
const orderInsertSelect = vi.fn(() => ({ single: orderInsertSingle }))
const orderInsert = vi.fn(() => ({ select: orderInsertSelect }))

const deleteEqSource = vi.fn()
const deleteEqId = vi.fn(() => ({ eq: deleteEqSource }))
const orderDelete = vi.fn(() => ({ eq: deleteEqId }))

const customerLimit = vi.fn()
const customerOrder = vi.fn(() => ({ limit: customerLimit }))
const customerEq = vi.fn(() => ({ order: customerOrder }))
const customerSelect = vi.fn(() => ({ eq: customerEq }))
const customerInsertSingle = vi.fn()
const customerInsertSelect = vi.fn(() => ({ single: customerInsertSingle }))
const customerInsert = vi.fn(() => ({ select: customerInsertSelect }))

const from = vi.fn((table: string) => {
  if (table === 'orders') return { select: ordersSelect, insert: orderInsert, delete: orderDelete }
  if (table === 'customers') return { select: customerSelect, insert: customerInsert }
  throw new Error(`unexpected table ${table}`)
})

vi.mock('@/lib/auth/requireUser', () => ({ requireUser: async () => ({ id: 'staff-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from }),
}))

import { listManualOrders, createManualOrder, deleteManualOrder, findPossibleDuplicate } from './manualOrders'

describe('listManualOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ordersOrder.mockResolvedValue({ data: [orderListRow], error: null })
  })

  it('lists only manual-source orders with customer info joined', async () => {
    const result = await listManualOrders()
    expect(ordersEq).toHaveBeenCalledWith('source', 'manual')
    expect(result).toEqual([
      {
        id: 'o1',
        orderNumber: 'ORD-0001',
        customerName: 'Nisma Parajuli',
        customerPhone: '9845948957',
        productName: 'Half Butterfly',
        color: 'Purple',
        phoneModel: 'iPhone 16Promax',
        qty: 1,
        total: 839,
        status: 'Delivered',
        orderDate: '2025-04-04T19:43:00.000Z',
      },
    ])
  })
})

describe('createManualOrder', () => {
  const input = {
    orderNumber: 'ORD-0055',
    customerName: 'Test Customer',
    customerPhone: '9800000000',
    productName: 'Brown Silicon',
    color: null,
    phoneModel: '15R',
    qty: 1,
    total: 639,
    status: 'Delivered',
    orderDate: '2026-01-01T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ordersMaybeSingle.mockResolvedValue({ data: null, error: null })
    customerLimit.mockResolvedValue({ data: [], error: null })
    customerInsertSingle.mockResolvedValue({ data: { id: 'new-customer-id' }, error: null })
    orderInsertSingle.mockResolvedValue({ data: { ...orderListRow, id: 'o55' }, error: null })
  })

  it('rejects an order number that already exists, from either source', async () => {
    ordersMaybeSingle.mockResolvedValue({ data: { id: 'existing' }, error: null })
    await expect(createManualOrder(input)).rejects.toThrow(/already exists/i)
    expect(customerInsert).not.toHaveBeenCalled()
    expect(orderInsert).not.toHaveBeenCalled()
  })

  it('creates a new customer when no existing customer matches the phone', async () => {
    await createManualOrder(input)
    expect(customerInsert).toHaveBeenCalledWith({ name: 'Test Customer', phone: '9800000000', subscribed_to_marketing: false })
    expect(orderInsert).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'new-customer-id', blanxer_order_number: 'ORD-0055', source: 'manual', status: null, blanxer_status: 'Delivered' })
    )
  })

  it('extracts color from the product name and normalizes the phone model before saving', async () => {
    await createManualOrder(input)
    expect(orderInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed_items: [expect.objectContaining({ name: 'Silicon', color: 'Brown', variant: 'iPhone 15' })],
      })
    )
  })

  it('uses the explicit color field instead of extracting one from the product name, when given', async () => {
    await createManualOrder({ ...input, productName: 'Silicon', color: 'Rose Gold' })
    expect(orderInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        parsed_items: [expect.objectContaining({ name: 'Silicon', color: 'Rose Gold' })],
      })
    )
  })

  it('reuses an existing customer matched by phone', async () => {
    customerLimit.mockResolvedValue({ data: [{ id: 'existing-customer-id' }], error: null })
    await createManualOrder(input)
    expect(customerInsert).not.toHaveBeenCalled()
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'existing-customer-id' }))
  })
})

describe('findPossibleDuplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the matching order when the same phone and amount occur the same day', async () => {
    ordersLte.mockResolvedValue({
      data: [{ order_number: 'ORD-0055', created_at: '2026-01-01T10:00:00.000Z', total: 639, customer: { phone: '9800000000' } }],
      error: null,
    })
    const result = await findPossibleDuplicate({ customerPhone: '9800000000', total: 639, orderDate: '2026-01-01T12:00:00.000Z' })
    expect(result).toEqual({ orderNumber: 'ORD-0055', orderDate: '2026-01-01T10:00:00.000Z' })
  })

  it('returns null when no order that day matches the phone', async () => {
    ordersLte.mockResolvedValue({
      data: [{ order_number: 'ORD-0055', created_at: '2026-01-01T10:00:00.000Z', total: 639, customer: { phone: '9811111111' } }],
      error: null,
    })
    const result = await findPossibleDuplicate({ customerPhone: '9800000000', total: 639, orderDate: '2026-01-01T12:00:00.000Z' })
    expect(result).toBeNull()
  })

  it('returns null when there are no same-amount orders that day', async () => {
    ordersLte.mockResolvedValue({ data: [], error: null })
    const result = await findPossibleDuplicate({ customerPhone: '9800000000', total: 639, orderDate: '2026-01-01T12:00:00.000Z' })
    expect(result).toBeNull()
  })
})

describe('deleteManualOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteEqSource.mockResolvedValue({ error: null })
  })

  it('only deletes a row scoped to source "manual", never a Blanxer-synced one', async () => {
    await deleteManualOrder('o55')
    expect(deleteEqId).toHaveBeenCalledWith('id', 'o55')
    expect(deleteEqSource).toHaveBeenCalledWith('source', 'manual')
  })
})
