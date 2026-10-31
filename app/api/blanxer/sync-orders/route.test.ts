/* eslint-disable @typescript-eslint/no-explicit-any -- mock request casts for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const requireStaffMock = vi.fn()
const syncFromBlanxerMock = vi.fn()

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: (...args: any[]) => requireStaffMock(...args) }))
vi.mock('@/lib/blanxer/sync', () => ({ syncFromBlanxer: (...args: any[]) => syncFromBlanxerMock(...args) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import { POST } from './route'

const request = {} as NextRequest

describe('POST /api/blanxer/sync-orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BLANXER_API_KEY = 'test-key'
    requireStaffMock.mockResolvedValue({ id: 'staff-1' })
    syncFromBlanxerMock.mockResolvedValue({ listed: 1, imported: 0, updated: 1, remaining: 0, errors: [], complete: true })
  })

  it('rejects a request without a login and syncs nothing', async () => {
    requireStaffMock.mockResolvedValue(null)
    expect((await POST(request)).status).toBe(401)
    expect(syncFromBlanxerMock).not.toHaveBeenCalled()
  })

  it('returns the sync result with a deadline inside the function limit', async () => {
    const before = Date.now()
    const body = await (await POST(request)).json()
    expect(body).toMatchObject({ ok: true, updated: 1 })
    const { deadline } = syncFromBlanxerMock.mock.calls[0][2]
    expect(deadline).toBeLessThanOrEqual(before + 60_000)
    expect(deadline).toBeGreaterThan(before)
  })

  it('reports a failure', async () => {
    syncFromBlanxerMock.mockRejectedValue(new Error('Blanxer API key exchange failed (403)'))
    const res = await POST(request)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('403')
  })
})
