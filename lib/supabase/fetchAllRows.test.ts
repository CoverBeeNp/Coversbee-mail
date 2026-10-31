/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase query builder */
import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows } from './fetchAllRows'

function client(pages: { data: unknown[] | null; error: { message: string } | null }[]): any {
  const range = vi.fn()
  pages.forEach((page) => range.mockResolvedValueOnce(page))
  const builder: any = { order: () => builder, range }
  return { from: () => ({ select: () => builder }) }
}

describe('fetchAllRows', () => {
  it('reads past the 1000 row page limit', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const rows = await fetchAllRows(client([{ data: fullPage, error: null }, { data: [{ id: 1000 }], error: null }]), 'orders', 'id', 'id')
    expect(rows).toHaveLength(1001)
  })

  it('throws on a failed page instead of returning partial data', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    await expect(
      fetchAllRows(client([{ data: fullPage, error: null }, { data: null, error: { message: 'timeout' } }]), 'orders', 'id', 'id')
    ).rejects.toThrow('Failed to load orders: timeout')
  })
})
