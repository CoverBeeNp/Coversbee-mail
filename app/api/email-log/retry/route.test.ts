/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase/request casts for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const requireStaffMock = vi.fn()
const sendEmailMock = vi.fn()

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: (...args: any[]) => requireStaffMock(...args) }))
vi.mock('@/lib/zoho/client', () => ({ sendEmail: (...args: any[]) => sendEmailMock(...args) }))

const orderUpdates: any[] = []
const emailLogInserts: any[] = []

function fakeSupabase() {
  return {
    from: (table: string) => {
      if (table === 'email_log') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => ({
                data: id === 'log-1'
                  ? { id: 'log-1', type: 'transactional', order_id: 'order-1', template_used: 'dispatched' }
                  : null,
                error: id === 'log-1' ? null : { message: 'not found' },
              }),
            }),
          }),
          insert: async (values: any) => { emailLogInserts.push(values); return { error: null } },
        }
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'order-1', blanxer_order_number: '99', parsed_items: [], total: 100, customer_id: 'cust-1',
                  customers: { name: 'Test Customer', email: 'customer@example.com' },
                },
                error: null,
              }),
            }),
          }),
          update: (values: any) => ({
            eq: async (_col: string, id: string) => { orderUpdates.push({ id, values }); return { error: null } },
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

describe('POST /api/email-log/retry', () => {
  beforeEach(() => {
    orderUpdates.length = 0
    emailLogInserts.length = 0
    requireStaffMock.mockReset()
    sendEmailMock.mockReset()
  })

  it('returns 401 when there is no authenticated staff user', async () => {
    requireStaffMock.mockResolvedValue(null)
    const res = await POST(fakeRequest({ emailLogId: 'log-1' }))
    expect(res.status).toBe(401)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('advances orders.status to the retried template on a successful resend', async () => {
    requireStaffMock.mockResolvedValue({ id: 'staff-1' })
    sendEmailMock.mockResolvedValue({ messageId: 'zoho-msg-1' })

    const res = await POST(fakeRequest({ emailLogId: 'log-1' }))
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(orderUpdates).toHaveLength(1)
    expect(orderUpdates[0].id).toBe('order-1')
    expect(orderUpdates[0].values.status).toBe('dispatched')
    expect(orderUpdates[0].values.status_updated_at).toBeTruthy()
    expect(emailLogInserts).toHaveLength(1)
    expect(emailLogInserts[0]).toMatchObject({ status: 'sent', template_used: 'dispatched' })
  })

  it('does not touch orders.status when the resend still fails', async () => {
    requireStaffMock.mockResolvedValue({ id: 'staff-1' })
    sendEmailMock.mockRejectedValue(new Error('Zoho send failed'))

    const res = await POST(fakeRequest({ emailLogId: 'log-1' }))
    const body = await res.json()

    expect(body.ok).toBe(false)
    expect(orderUpdates).toHaveLength(0)
    expect(emailLogInserts).toHaveLength(1)
    expect(emailLogInserts[0]).toMatchObject({ status: 'failed' })
  })
})
