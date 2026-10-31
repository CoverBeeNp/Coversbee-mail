/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase/request casts for tests */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const requireStaffMock = vi.fn()
const exchangeBlanxerApiKeyMock = vi.fn()
const listBlanxerOrdersMock = vi.fn()
const getBlanxerOrderDetailMock = vi.fn()
const saveOrderMock = vi.fn()
const syncStateUpdates: any[] = []

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: (...args: any[]) => requireStaffMock(...args) }))
vi.mock('@/lib/blanxer/client', () => ({
  exchangeBlanxerApiKey: (...args: any[]) => exchangeBlanxerApiKeyMock(...args),
  listBlanxerOrders: (...args: any[]) => listBlanxerOrdersMock(...args),
  getBlanxerOrderDetail: (...args: any[]) => getBlanxerOrderDetailMock(...args),
}))
vi.mock('@/lib/blanxer/mapOrder', () => ({
  mapBlanxerOrder: (detail: any, createdAt: string) => ({ blanxerId: detail._id, createdAt }),
}))
vi.mock('@/lib/orders/saveOrder', () => ({ saveOrder: (...args: any[]) => saveOrderMock(...args) }))

let lastSyncedAt = '2026-10-30T00:00:00.000Z'
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { last_synced_at: lastSyncedAt }, error: null }) }) }),
      update: (values: any) => ({ eq: async () => { syncStateUpdates.push(values); return { error: null } } }),
    }),
  }),
}))

import { POST } from './route'

const NOW = new Date('2026-10-31T12:00:00.000Z')
const request = {} as NextRequest

describe('POST /api/blanxer/sync-orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: NOW })
    syncStateUpdates.length = 0
    lastSyncedAt = '2026-10-30T00:00:00.000Z'
    process.env.BLANXER_API_KEY = 'test-key'
    requireStaffMock.mockResolvedValue({ id: 'staff-1' })
    exchangeBlanxerApiKeyMock.mockResolvedValue({ token: 'tok', storeId: 'store-1' })
    listBlanxerOrdersMock.mockResolvedValue([])
    getBlanxerOrderDetailMock.mockImplementation(async (_t: string, _s: string, id: string) => ({ _id: id }))
    saveOrderMock.mockResolvedValue('inserted')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a request without a login and touches nothing', async () => {
    requireStaffMock.mockResolvedValue(null)
    const res = await POST(request)
    expect(res.status).toBe(401)
    expect(exchangeBlanxerApiKeyMock).not.toHaveBeenCalled()
  })

  it('re-checks the last 30 days even when the cursor is recent', async () => {
    await POST(request)
    expect(listBlanxerOrdersMock.mock.calls[0][2]).toBe('2026-10-01T12:00:00.000Z')
  })

  it('reaches further back than 30 days when the cursor is older', async () => {
    lastSyncedAt = '2026-08-01T00:00:00.000Z'
    await POST(request)
    expect(listBlanxerOrdersMock.mock.calls[0][2]).toBe('2026-07-31T23:55:00.000Z')
  })

  it('passes the list creation date to the mapper and counts new and updated orders', async () => {
    listBlanxerOrdersMock.mockResolvedValue([
      { _id: 'a', order_number: 1, created_at: '2026-10-05T00:00:00.000Z' },
      { _id: 'b', order_number: 2, created_at: '2026-10-06T00:00:00.000Z' },
    ])
    saveOrderMock.mockResolvedValueOnce('inserted').mockResolvedValueOnce('updated')
    const body = await (await POST(request)).json()
    expect(body).toMatchObject({ ok: true, imported: 1, updated: 1, errors: [] })
    expect(saveOrderMock.mock.calls[0][1]).toEqual({ blanxerId: 'a', createdAt: '2026-10-05T00:00:00.000Z' })
  })

  it('reports a failed order and carries on with the rest', async () => {
    listBlanxerOrdersMock.mockResolvedValue([
      { _id: 'bad', order_number: 1, created_at: '2026-10-05T00:00:00.000Z' },
      { _id: 'good', order_number: 2, created_at: '2026-10-06T00:00:00.000Z' },
    ])
    getBlanxerOrderDetailMock.mockImplementation(async (_t: string, _s: string, id: string) => {
      if (id === 'bad') throw new Error('Blanxer order detail failed (500)')
      return { _id: id }
    })
    const body = await (await POST(request)).json()
    expect(body.imported).toBe(1)
    expect(body.errors).toEqual(['Order #1: Blanxer order detail failed (500)'])
  })

  it('moves the cursor to now after a clean run', async () => {
    await POST(request)
    expect(syncStateUpdates).toEqual([{ last_synced_at: NOW.toISOString() }])
  })

  it('does not move the cursor past a window whose list call failed', async () => {
    lastSyncedAt = '2026-08-01T00:00:00.000Z'
    listBlanxerOrdersMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Blanxer order list failed (500)'))
    const body = await (await POST(request)).json()
    expect(body.lastSyncedAt).toBe('2026-08-31T23:55:00.000Z')
    expect(syncStateUpdates).toEqual([{ last_synced_at: '2026-08-31T23:55:00.000Z' }])
    expect(body.errors).toHaveLength(1)
  })
})
