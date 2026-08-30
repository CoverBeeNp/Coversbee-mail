/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase/request casts for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const requireStaffMock = vi.fn()
const exchangeBlanxerApiKeyMock = vi.fn()
const listBlanxerOrdersMock = vi.fn()
const getBlanxerOrderDetailMock = vi.fn()
const saveParsedOrderMock = vi.fn()

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: (...args: any[]) => requireStaffMock(...args) }))
vi.mock('@/lib/blanxer/client', () => ({
  exchangeBlanxerApiKey: (...args: any[]) => exchangeBlanxerApiKeyMock(...args),
  listBlanxerOrders: (...args: any[]) => listBlanxerOrdersMock(...args),
  getBlanxerOrderDetail: (...args: any[]) => getBlanxerOrderDetailMock(...args),
}))
vi.mock('@/lib/orders/saveParsedOrder', () => ({ saveParsedOrder: (...args: any[]) => saveParsedOrderMock(...args) }))
vi.mock('@/lib/parser/blanxerParser', () => ({
  mapBlanxerApiOrder: (detail: any) => ({ blanxerId: detail._id, blanxerOrderNumber: String(detail.order_number) }),
}))

// Blanxer order list: #101 was already synced before (has a local row with
// blanxer_id set), #102 was entered by hand via the paste flow before this
// order existed in Blanxer's API (local row has blanxer_order_number '102'
// but blanxer_id is null), #103 is genuinely new.
const LISTED = [
  { _id: 'bx-101', order_number: 101, created_at: '2026-08-01T00:00:00Z' },
  { _id: 'bx-102', order_number: 102, created_at: '2026-08-01T00:00:00Z' },
  { _id: 'bx-103', order_number: 103, created_at: '2026-08-01T00:00:00Z' },
]

const syncStateUpdates: any[] = []
const orderBlanxerIdBackfills: any[] = []

function fakeSupabase() {
  return {
    from: (table: string) => {
      if (table === 'blanxer_sync_state') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { last_synced_at: '2026-08-01T00:00:00Z' }, error: null }) }) }),
          update: (values: any) => ({ eq: async () => { syncStateUpdates.push(values); return { error: null } } }),
        }
      }
      if (table === 'orders') {
        return {
          select: (cols: string) => {
            if (cols === 'blanxer_id') {
              return { in: async () => ({ data: [{ blanxer_id: 'bx-101' }], error: null }) }
            }
            if (cols === 'id, blanxer_order_number') {
              return {
                in: () => ({
                  is: async () => ({ data: [{ id: 'local-order-102', blanxer_order_number: '102' }], error: null }),
                }),
              }
            }
            throw new Error(`unexpected orders select ${cols}`)
          },
          update: (values: any) => ({ eq: async (_c: string, id: string) => { orderBlanxerIdBackfills.push({ id, values }); return { error: null } } }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeSupabase() }))

const { POST } = await import('./route')

function fakeRequest(): NextRequest {
  return {} as unknown as NextRequest
}

describe('POST /api/blanxer/sync-orders', () => {
  beforeEach(() => {
    syncStateUpdates.length = 0
    orderBlanxerIdBackfills.length = 0
    process.env.BLANXER_API_KEY = 'test-key'
    requireStaffMock.mockReset().mockResolvedValue({ id: 'staff-1' })
    exchangeBlanxerApiKeyMock.mockReset().mockResolvedValue({ token: 'tok', storeId: 'store-1' })
    listBlanxerOrdersMock.mockReset().mockResolvedValue(LISTED)
    getBlanxerOrderDetailMock.mockReset().mockImplementation(async (_token: string, _storeId: string, orderId: string) => ({
      _id: orderId,
      order_number: orderId === 'bx-103' ? 103 : -1,
    }))
    saveParsedOrderMock.mockReset().mockResolvedValue({ orderId: 'new-order-id' })
  })

  it('skips an order already synced by blanxer_id, backfills blanxer_id on a matching manually-pasted order instead of duplicating it, and imports only the genuinely new order', async () => {
    const res = await POST(fakeRequest())
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.imported).toBe(1)
    expect(body.backfilled).toBe(1)

    // #103 is the only one actually fetched/saved as a new order.
    expect(getBlanxerOrderDetailMock).toHaveBeenCalledTimes(1)
    expect(getBlanxerOrderDetailMock).toHaveBeenCalledWith('tok', 'store-1', 'bx-103')
    expect(saveParsedOrderMock).toHaveBeenCalledTimes(1)

    // #102's existing local row gets blanxer_id backfilled, not a new insert.
    expect(orderBlanxerIdBackfills).toEqual([{ id: 'local-order-102', values: { blanxer_id: 'bx-102' } }])
  })
})
