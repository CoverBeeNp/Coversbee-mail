/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase client cast for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAccessToken, sendEmail, ZohoAuthError, ZohoSendError } from './client'

function mockSupabase(row: { access_token: string | null; expires_at: string | null }) {
  const updates: Record<string, any[]> = {}
  return {
    from: (table: string) => ({
      select: () => ({ single: async () => ({ data: row, error: null }) }),
      update: (values: any) => {
        updates[table] = updates[table] ?? []
        updates[table].push(values)
        return { eq: async () => ({ error: null }) }
      },
    }),
    _updates: updates,
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

  it('throws ZohoAuthError and flips zoho_connected to false when refresh returns HTTP 200 with a body missing access_token/expires_in', async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'stale-token', expires_at: pastExpiry })
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 'invalid_client' }),
    } as Response)
    await expect(getAccessToken(supabase as any)).rejects.toThrow(ZohoAuthError)
    const statusUpdates = supabase._updates['system_status']
    expect(statusUpdates).toBeDefined()
    expect(statusUpdates[statusUpdates.length - 1]).toMatchObject({ zoho_connected: false })
  })
})

describe('sendEmail', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('throws ZohoSendError when the send response body fails to parse as JSON', async () => {
    const futureExpiry = new Date(Date.now() + 60_000).toISOString()
    const supabase = mockSupabase({ access_token: 'cached-token', expires_at: futureExpiry })
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON') },
    } as unknown as Response)
    await expect(
      sendEmail(supabase as any, { to: 'a@b.com', subject: 'hi', htmlBody: '<p>hi</p>' })
    ).rejects.toThrow(ZohoSendError)
  })
})
