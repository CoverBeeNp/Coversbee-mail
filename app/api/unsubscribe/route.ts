import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Public endpoint — reached only from the unsubscribe page's confirm
// button, never behind staff auth (proxy.ts explicitly exempts this path
// even though its matcher otherwise covers /api/:path*). It performs exactly
// one narrow, safe mutation — flip a single customer's
// subscribed_to_marketing to false — via a service-role client server-side;
// no direct database access is ever exposed to the visitor's browser.
export async function POST(request: NextRequest) {
  const { customerId } = (await request.json()) as { customerId?: string }
  if (!customerId || typeof customerId !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing customerId' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('customers').update({ subscribed_to_marketing: false }).eq('id', customerId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
