/* eslint-disable @typescript-eslint/no-explicit-any -- mocks for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listMock = vi.fn()
const detailMock = vi.fn()
const saveOrderMock = vi.fn()
const fetchAllRowsMock = vi.fn()
const cursorUpdates: any[] = []

vi.mock('@/lib/blanxer/client', () => ({
  exchangeBlanxerApiKey: async () => ({ token: 'tok', storeId: 'store' }),
  listBlanxerOrders: (...args: any[]) => listMock(...args),
  getBlanxerOrderDetail: (...args: any[]) => detailMock(...args),
}))
vi.mock('@/lib/blanxer/mapOrder', () => ({ mapBlanxerOrder: (detail: any) => ({ blanxerId: detail._id }) }))
vi.mock('@/lib/orders/saveOrder', () => ({ saveOrder: (...args: any[]) => saveOrderMock(...args) }))
vi.mock('@/lib/supabase/fetchAllRows', () => ({ fetchAllRows: (...args: any[]) => fetchAllRowsMock(...args) }))

import { syncFromBlanxer } from './sync'

const supabase: any = {
  from: () => ({ update: (values: any) => ({ eq: async () => { cursorUpdates.push(values); return { error: null } } }) }),
}
const now = new Date('2026-10-31T12:00:00.000Z')
const T1 = '2026-10-01T00:00:00.000Z'
const T2 = '2026-10-02T00:00:00.000Z'

function order(id: string, updated_at: string, order_number = 1) {
  return { _id: id, order_number, created_at: T1, updated_at }
}

// Returns each order once, however many month windows are listed.
function listReturns(orders: any[]) {
  let served = false
  listMock.mockImplementation(async () => {
    if (served) return []
    served = true
    return orders
  })
}

describe('syncFromBlanxer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cursorUpdates.length = 0
    listMock.mockReset()
    detailMock.mockImplementation(async (_t: string, _s: string, id: string) => ({ _id: id }))
    saveOrderMock.mockResolvedValue('updated')
    fetchAllRowsMock.mockResolvedValue([])
  })

  it('reads the whole history, not only recent orders', async () => {
    listReturns([])
    await syncFromBlanxer(supabase, 'key', { now })
    expect(listMock.mock.calls[0][2]).toBe('2025-01-01T00:00:00.000Z')
  })

  it('fetches details only for new and changed orders', async () => {
    listReturns([order('same', T1), order('changed', T2), order('new', T1)])
    fetchAllRowsMock.mockResolvedValue([
      { blanxer_id: 'same', blanxer_updated_at: '2026-10-01T00:00:00+00:00' },
      { blanxer_id: 'changed', blanxer_updated_at: T1 },
    ])
    saveOrderMock.mockImplementation(async (_s: any, o: any) => (o.blanxerId === 'new' ? 'inserted' : 'updated'))
    const result = await syncFromBlanxer(supabase, 'key', { now })
    expect(detailMock.mock.calls.map((c) => c[2]).sort()).toEqual(['changed', 'new'])
    expect(result).toMatchObject({ listed: 3, imported: 1, updated: 1, remaining: 0, complete: true })
  })

  it('treats an order never read as changed', async () => {
    listReturns([order('a', T1)])
    fetchAllRowsMock.mockResolvedValue([{ blanxer_id: 'a', blanxer_updated_at: null }])
    await syncFromBlanxer(supabase, 'key', { now })
    expect(detailMock).toHaveBeenCalledOnce()
  })

  it('handles new orders before updates', async () => {
    listReturns([order('known', T2), order('new', T1)])
    fetchAllRowsMock.mockResolvedValue([{ blanxer_id: 'known', blanxer_updated_at: T1 }])
    await syncFromBlanxer(supabase, 'key', { now })
    expect(saveOrderMock.mock.calls[0][1].blanxerId).toBe('new')
  })

  it('stops at the deadline, reports what is left and leaves the sync time alone', async () => {
    listReturns(Array.from({ length: 7 }, (_, i) => order(`o${i}`, T1, i)))
    const result = await syncFromBlanxer(supabase, 'key', { now, deadline: Date.now() - 1 })
    expect(result).toMatchObject({ updated: 0, remaining: 7, complete: false })
    expect(cursorUpdates).toEqual([])
  })

  it('reports a failed order, carries on, and does not call the sync complete', async () => {
    listReturns([order('bad', T1, 1), order('good', T1, 2)])
    detailMock.mockImplementation(async (_t: string, _s: string, id: string) => {
      if (id === 'bad') throw new Error('Blanxer order detail failed (500)')
      return { _id: id }
    })
    const result = await syncFromBlanxer(supabase, 'key', { now })
    expect(result.updated).toBe(1)
    expect(result.errors).toEqual(['Order #1: Blanxer order detail failed (500)'])
    expect(result.complete).toBe(false)
    expect(cursorUpdates).toEqual([])
  })

  it('does not call the sync complete when a month could not be listed', async () => {
    listMock.mockRejectedValueOnce(new Error('Blanxer order list failed (500)')).mockResolvedValue([])
    const result = await syncFromBlanxer(supabase, 'key', { now })
    expect(result.complete).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('records the sync time after a clean run', async () => {
    listReturns([])
    await syncFromBlanxer(supabase, 'key', { now })
    expect(cursorUpdates).toEqual([{ last_synced_at: now.toISOString() }])
  })
})
