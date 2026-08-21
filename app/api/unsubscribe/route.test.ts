/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase/request casts for tests */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const customerUpdates: any[] = []
let updateShouldFail = false

function fakeSupabase() {
  return {
    from: (table: string) => {
      if (table === 'customers') {
        return {
          update: (values: any) => ({
            eq: async (_col: string, id: string) => {
              customerUpdates.push({ id, values })
              return { error: updateShouldFail ? { message: 'db error' } : null }
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeSupabase() }))

const { POST } = await import('./route')

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('POST /api/unsubscribe', () => {
  beforeEach(() => {
    customerUpdates.length = 0
    updateShouldFail = false
  })

  it('is reachable with no staff auth — this endpoint is deliberately public', async () => {
    // No requireStaff mock/call anywhere in this file or route.ts: a
    // request with no session at all must still succeed.
    const res = await POST(fakeRequest({ customerId: 'cust-1' }))
    expect(res.status).toBe(200)
  })

  it('flips subscribed_to_marketing to false for the given customer', async () => {
    const res = await POST(fakeRequest({ customerId: 'cust-1' }))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(customerUpdates).toHaveLength(1)
    expect(customerUpdates[0]).toEqual({ id: 'cust-1', values: { subscribed_to_marketing: false } })
  })

  it('returns 400 when customerId is missing', async () => {
    const res = await POST(fakeRequest({}))
    expect(res.status).toBe(400)
    expect(customerUpdates).toHaveLength(0)
  })

  it('returns 500 when the update fails', async () => {
    updateShouldFail = true
    const res = await POST(fakeRequest({ customerId: 'cust-1' }))
    expect(res.status).toBe(500)
  })
})
