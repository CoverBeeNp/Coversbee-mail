import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { exchangeBlanxerApiKey, listBlanxerOrders, getBlanxerOrderDetail } from '@/lib/blanxer/client'
import { mapBlanxerApiOrder } from '@/lib/parser/blanxerParser'
import { saveParsedOrder } from '@/lib/orders/saveParsedOrder'

// Manual-trigger-only sync (no cron): a staff member clicks "Sync from
// Blanxer" on the orders page, this pulls anything created since the last
// successful sync, and imports orders that aren't already here. It never
// touches the status of orders already imported — that stays a manual
// action in Coversbee, same as today, so a sync can't accidentally fire a
// transactional email.
export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.BLANXER_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'BLANXER_API_KEY is not configured' }, { status: 500 })

  const supabase = createServiceClient()

  const { data: syncState, error: syncStateError } = await supabase
    .from('blanxer_sync_state')
    .select('last_synced_at')
    .eq('id', true)
    .single()
  if (syncStateError || !syncState) {
    return NextResponse.json({ ok: false, error: 'Sync state row missing — apply migration 0007' }, { status: 500 })
  }

  const now = new Date()
  // Look back 5 minutes before the last cursor to cover any order that was
  // still being written when the previous sync ran its query — the blanxer_id
  // dedup check below makes re-seeing an already-imported order harmless.
  const from = new Date(new Date(syncState.last_synced_at).getTime() - 5 * 60 * 1000)

  let token: string
  let storeId: string
  try {
    ;({ token, storeId } = await exchangeBlanxerApiKey(apiKey))
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }

  let listed
  try {
    listed = await listBlanxerOrders(token, storeId, from.toISOString(), now.toISOString())
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }

  const candidateIds = listed.map((o) => o._id)
  const { data: existingRows, error: existingError } = candidateIds.length
    ? await supabase.from('orders').select('blanxer_id').in('blanxer_id', candidateIds)
    : { data: [], error: null }
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 })
  const existingIds = new Set((existingRows ?? []).map((r) => r.blanxer_id))

  const newOrders = listed.filter((o) => !existingIds.has(o._id))

  let imported = 0
  const errors: string[] = []
  for (const o of newOrders) {
    try {
      const detail = await getBlanxerOrderDetail(token, storeId, o._id)
      const parsed = mapBlanxerApiOrder(detail)
      await saveParsedOrder(supabase, { parsed, rawPastedText: null, blanxerId: parsed.blanxerId })
      imported++
    } catch (err) {
      errors.push(`Order #${o.order_number}: ${(err as Error).message}`)
    }
  }

  await supabase.from('blanxer_sync_state').update({ last_synced_at: now.toISOString() }).eq('id', true)

  return NextResponse.json({ ok: true, imported, skipped: listed.length - newOrders.length, errors })
}
