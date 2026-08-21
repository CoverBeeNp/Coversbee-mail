// Integration test against the local Supabase instance (docker) rather than
// a mocked client — saveOrder's customer-matching logic touches real rows
// across two tables and is easiest to trust against a real Postgres/RLS
// stack. Requires `supabase start` to be running locally with the default
// demo keys (see .env.local / README "Running locally").
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

let localSupabaseReachable = true

beforeAll(async () => {
  const { error } = await admin.from('customers').select('id').limit(1)
  if (error) localSupabaseReachable = false
})

describe.skipIf(!localSupabaseReachable)('saveOrder (Finding 7: backfill customer contact info)', () => {
  it('fills in a null email on an existing customer matched by phone, without touching an existing non-null email', async () => {
    const { saveOrder } = await import('./actions')
    const phone = `999${Date.now()}`

    const { data: customer, error: insertErr } = await admin
      .from('customers')
      .insert({ name: 'Unknown', phone, email: null })
      .select('id')
      .single()
    expect(insertErr).toBeNull()

    const baseParsed = {
      items: [], subtotal: 100, deliveryCharge: 0, total: 100,
      province: null, city: null, address: null, landmark: null, orderNote: null, trackingUrl: null,
      unmatchedFields: [],
    }

    await saveOrder({
      rawPastedText: 'raw',
      parsed: {
        ...baseParsed,
        customerName: 'Real Name',
        customerPhone: phone,
        customerEmail: 'newlycaptured@example.com',
        blanxerOrderNumber: 'T-1',
      },
    })

    const { data: after } = await admin.from('customers').select('id, name, email').eq('id', customer!.id).single()
    expect(after?.email).toBe('newlycaptured@example.com')
    expect(after?.name).toBe('Real Name')

    // A second order with a *different* email must not clobber the one just backfilled.
    await saveOrder({
      rawPastedText: 'raw2',
      parsed: {
        ...baseParsed,
        customerName: 'Real Name',
        customerPhone: phone,
        customerEmail: 'different@example.com',
        blanxerOrderNumber: 'T-2',
      },
    })
    const { data: afterSecond } = await admin.from('customers').select('email').eq('id', customer!.id).single()
    expect(afterSecond?.email).toBe('newlycaptured@example.com')

    await admin.from('orders').delete().eq('customer_id', customer!.id)
    await admin.from('customers').delete().eq('id', customer!.id)
  })
})
