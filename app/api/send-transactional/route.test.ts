/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase/request casts for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const sendEmailMock = vi.fn()
let order: any

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: async () => ({ id: 'staff-1' }) }))
vi.mock('@/lib/zoho/client', () => ({ sendEmail: (...args: any[]) => sendEmailMock(...args) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'orders') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: order, error: null }) }) }),
          update: () => ({ eq: async () => ({ error: null }) }),
        }
      }
      return { insert: async () => ({ error: null }) }
    },
  }),
}))

import { POST } from './route'

function request(): NextRequest {
  return { json: async () => ({ orderId: 'o1', status: 'dispatched' }) } as unknown as NextRequest
}

const baseOrder = {
  id: 'o1', blanxer_order_number: '1747', parsed_items: [], total: 969, address: null,
  tracking_url: null, customer_id: 'c1', customers: { name: 'Nees', email: 'nees@example.com' },
}

describe('POST /api/send-transactional', () => {
  beforeEach(() => {
    sendEmailMock.mockReset()
    sendEmailMock.mockResolvedValue({ messageId: 'm1' })
  })

  it('refuses to email the customer of an order outside the email workflow', async () => {
    order = { ...baseOrder, status: null }
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('sends for an order in the email workflow', async () => {
    order = { ...baseOrder, status: 'received' }
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(sendEmailMock).toHaveBeenCalledOnce()
  })
})
