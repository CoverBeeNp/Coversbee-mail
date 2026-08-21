import { describe, it, expect, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const getUserMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: getUserMock },
  })),
}))

const { requireStaff } = await import('./requireStaff')

function fakeRequest(): NextRequest {
  return { cookies: { getAll: () => [] } } as unknown as NextRequest
}

describe('requireStaff', () => {
  it('returns null when there is no authenticated session', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } })
    const user = await requireStaff(fakeRequest())
    expect(user).toBeNull()
  })

  it('returns the user when there is an authenticated session', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'staff-1' } } })
    const user = await requireStaff(fakeRequest())
    expect(user).toEqual({ id: 'staff-1' })
  })
})
