/* eslint-disable @typescript-eslint/no-explicit-any -- mock request casts for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const requireStaffMock = vi.fn()
const syncMock = vi.fn()
const accountMock = vi.fn()

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: (...args: any[]) => requireStaffMock(...args) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/instagram/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instagram/sync')>()),
  syncInstagram: (...args: any[]) => syncMock(...args),
  getInstagramAccount: (...args: any[]) => accountMock(...args),
}))

import { POST } from './route'

const request = (query = '') => ({ nextUrl: new URL(`http://localhost/api/instagram/sync${query}`) }) as NextRequest

describe('POST /api/instagram/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireStaffMock.mockResolvedValue({ id: 'staff-1' })
    syncMock.mockResolvedValue({ username: 'coversbee', daysSynced: 3, daysRemaining: 0, posts: 1, postsUpdated: 1, postsRemaining: 0 })
  })

  it('rejects a request without a login', async () => {
    requireStaffMock.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(401)
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('syncs when asked directly', async () => {
    const body = await (await POST(request())).json()
    expect(body).toMatchObject({ ok: true, daysSynced: 3 })
  })

  it('skips a stale-only request when the last sync is recent', async () => {
    accountMock.mockResolvedValue({ last_synced_at: new Date().toISOString() })
    const body = await (await POST(request('?ifStale=1'))).json()
    expect(body).toEqual({ ok: true, skipped: 'fresh' })
    expect(syncMock).not.toHaveBeenCalled()
  })

  it('skips a stale-only request when Instagram is not connected', async () => {
    accountMock.mockResolvedValue(null)
    const body = await (await POST(request('?ifStale=1'))).json()
    expect(body).toEqual({ ok: true, skipped: 'not-connected' })
  })

  it('syncs a stale-only request when the last sync is hours old', async () => {
    accountMock.mockResolvedValue({ last_synced_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() })
    await POST(request('?ifStale=1'))
    expect(syncMock).toHaveBeenCalled()
  })
})
