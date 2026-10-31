import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exchangeBlanxerApiKey, listBlanxerOrders, getBlanxerOrderDetail } from './client'

describe('exchangeBlanxerApiKey', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the api key and returns token + store id', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'tok-123', store: { _id: 'store-1' } }),
    })

    const result = await exchangeBlanxerApiKey('my-key')

    expect(result).toEqual({ token: 'tok-123', storeId: 'store-1' })
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.blanxer.com/api-key/check')
    expect(JSON.parse(init.body)).toEqual({ api_key: 'my-key' })
  })

  it('throws on a non-ok response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 })
    await expect(exchangeBlanxerApiKey('bad-key')).rejects.toThrow('401')
  })
})

describe('listBlanxerOrders', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the date-ranged order list and returns its items', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ orders: [{ _id: 'o1', order_number: 1, created_at: '2026-01-01T00:00:00Z' }] }),
    })

    const result = await listBlanxerOrders('tok', 'store-1', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')

    expect(result).toEqual([{ _id: 'o1', order_number: 1, created_at: '2026-01-01T00:00:00Z' }])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.blanxer.com/order/store-1?from=2026-01-01T00%3A00%3A00Z&to=2026-02-01T00%3A00%3A00Z')
  })

  it('returns an empty array when the response has no orders field', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) })
    const result = await listBlanxerOrders('tok', 'store-1', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')
    expect(result).toEqual([])
  })
})

describe('getBlanxerOrderDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and returns the order detail', async () => {
    const detail = { _id: 'o1', order_number: 1, status: 'Delivered' }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => detail })

    const result = await getBlanxerOrderDetail('tok', 'store-1', 'o1')

    expect(result).toEqual(detail)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.blanxer.com/order/store-1/o1')
  })
})
