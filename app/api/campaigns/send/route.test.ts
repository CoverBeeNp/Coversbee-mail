/* eslint-disable @typescript-eslint/no-explicit-any -- mock supabase/request casts for tests */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const requireStaffMock = vi.fn()
const sendEmailMock = vi.fn()
const resolveSegmentCustomerIdsMock = vi.fn()

vi.mock('@/lib/auth/requireStaff', () => ({ requireStaff: (...args: any[]) => requireStaffMock(...args) }))
vi.mock('@/lib/zoho/client', () => ({ sendEmail: (...args: any[]) => sendEmailMock(...args) }))
vi.mock('@/lib/segments/resolveSegment', () => ({ resolveSegmentCustomerIds: (...args: any[]) => resolveSegmentCustomerIdsMock(...args) }))

const campaignRecipientUpserts: any[] = []
const campaignStatusUpdates: any[] = []
const emailLogInserts: any[] = []

const CAMPAIGN = { id: 'camp-1', subject: 'Big sale', body_template: '<p>Sale!</p>', segment_filter: { type: 'all_subscribed' } }
// This customer is both a real segment member AND a staff test address — the
// scenario Finding 4 is about: a test send must never exclude them from the
// later real send.
const CUSTOMERS = [{ id: 'cust-real-and-test', email: 'both@example.com' }]

function fakeSupabase() {
  return {
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: CAMPAIGN, error: null }) }) }),
          update: (values: any) => ({ eq: async (_c: string, id: string) => { campaignStatusUpdates.push({ id, values }); return { error: null } } }),
        }
      }
      if (table === 'test_recipients') {
        return { select: async () => ({ data: [{ email: 'both@example.com' }] }) }
      }
      if (table === 'customers') {
        return { select: () => ({ in: async () => ({ data: CUSTOMERS }) }) }
      }
      if (table === 'campaign_recipients') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }),
          upsert: async (rows: any) => { campaignRecipientUpserts.push(...rows); return { error: null } },
        }
      }
      if (table === 'email_log') {
        return { insert: async (values: any) => { emailLogInserts.push(values); return { error: null } } }
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

describe('POST /api/campaigns/send', () => {
  beforeEach(() => {
    campaignRecipientUpserts.length = 0
    campaignStatusUpdates.length = 0
    emailLogInserts.length = 0
    requireStaffMock.mockReset().mockResolvedValue({ id: 'staff-1' })
    sendEmailMock.mockReset().mockResolvedValue({ messageId: 'zoho-msg-1' })
    resolveSegmentCustomerIdsMock.mockReset().mockResolvedValue(['cust-real-and-test'])
  })

  it('sends test mode directly and never writes to campaign_recipients or flips campaign status', async () => {
    const res = await POST(fakeRequest({ campaignId: 'camp-1', testMode: true }))
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ to: 'both@example.com' }))
    expect(campaignRecipientUpserts).toHaveLength(0)
    expect(campaignStatusUpdates).toHaveLength(0)
    expect(emailLogInserts).toHaveLength(1)
    expect(emailLogInserts[0]).toMatchObject({ customer_id: 'cust-real-and-test', status: 'sent' })
  })

  it('the real segment send still includes a customer who was previously test-sent to', async () => {
    // Real "Send to segment" for the same campaign, after the test send
    // above. Because test sends never touch campaign_recipients, the
    // alreadySent exclusion (which only looks at campaign_recipients rows
    // with status='sent') has nothing to exclude — the customer is queued.
    const res = await POST(fakeRequest({ campaignId: 'camp-1', testMode: false }))
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.queued).toBe(1)
    expect(campaignRecipientUpserts).toEqual([
      { campaign_id: 'camp-1', customer_id: 'cust-real-and-test', status: 'queued' },
    ])
    expect(campaignStatusUpdates).toEqual([{ id: 'camp-1', values: { status: 'sending' } }])
  })
})
