/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase client cast for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAccessToken, ZohoAuthError } from './client'

function mockSupabase(row: { access_token: string | null; expires_at: string | null }) {
  return {
    from: () => ({
      select: () => ({ single: async () => ({ data: row, error: null }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }
}

describe('getAccessToken', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns the cached token when not expired', async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'cached-token', expires_at: futureExpiry })
    const fetchSpy = vi.spyOn(global, 'fetch')
    const token = await getAccessToken(supabase as any)
    expect(token).toBe('cached-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes and returns a new token when expired', async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'stale-token', expires_at: pastExpiry })
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fresh-token', expires_in: 3600 }),
    } as Response)
    const token = await getAccessToken(supabase as any)
    expect(token).toBe('fresh-token')
  })

  it('throws ZohoAuthError when refresh fails', async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'stale-token', expires_at: pastExpiry })
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) } as Response)
    await expect(getAccessToken(supabase as any)).rejects.toThrow(ZohoAuthError)
  })
})
