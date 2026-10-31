import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { exchangeBlanxerApiKey, listBlanxerOrders, getBlanxerOrderDetail } from '@/lib/blanxer/client'
import { mapBlanxerOrder } from '@/lib/blanxer/mapOrder'
import { monthWindows } from '@/lib/blanxer/dateWindows'
import { saveOrder } from '@/lib/orders/saveOrder'

// Sequential detail calls for a full re-check can take a while, so allow more
// than the default. If the function is cut off the cursor hasn't moved, and
// running sync again repeats the work safely.
export const maxDuration = 60

// The cursor only moves forward, so without this an order cancelled or returned
// after import would keep its old status and still count as revenue. Each sync
// re-reads recent orders to pick up those changes.
const STATUS_RECHECK_DAYS = 30
const CURSOR_OVERLAP_MS = 5 * 60 * 1000
const DETAIL_BATCH_SIZE = 5

type ListedOrder = Awaited<ReturnType<typeof listBlanxerOrders>>[number]

// Manual-trigger-only sync (no cron). This never sends email and never changes
// orders.status; see lib/orders/saveOrder.ts.
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
    return NextResponse.json({ ok: false, error: 'Sync state row missing — apply the migrations' }, { status: 500 })
  }

  const now = new Date()
  const recheckFrom = now.getTime() - STATUS_RECHECK_DAYS * 24 * 60 * 60 * 1000
  const cursorFrom = new Date(syncState.last_synced_at).getTime() - CURSOR_OVERLAP_MS
  const from = new Date(Math.min(recheckFrom, cursorFrom))

  let token: string
  let storeId: string
  try {
    ;({ token, storeId } = await exchangeBlanxerApiKey(apiKey))
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }

  const windows = monthWindows(from.toISOString(), now.toISOString())
  let imported = 0
  let updated = 0
  const errors: string[] = []

  // The cursor may only advance over windows whose order list was read. A
  // window whose list call failed was never seen, so moving past it would
  // skip its orders permanently once they age out of the re-check.
  let cursorUpTo: string | null = null
  let listFailed = false

  for (const window of windows) {
    let listed: ListedOrder[]
    try {
      listed = await listBlanxerOrders(token, storeId, window.from, window.to)
    } catch (err) {
      errors.push(`Window ${window.from}–${window.to}: ${(err as Error).message}`)
      listFailed = true
      continue
    }
    if (!listFailed) cursorUpTo = window.to

    for (let i = 0; i < listed.length; i += DETAIL_BATCH_SIZE) {
      const batch = listed.slice(i, i + DETAIL_BATCH_SIZE)
      const details = await Promise.allSettled(batch.map((item) => getBlanxerOrderDetail(token, storeId, item._id)))

      // Details are fetched in parallel, but saved one at a time so two orders
      // from one new customer can't both create that customer.
      for (const [index, detail] of details.entries()) {
        const item = batch[index]
        if (detail.status === 'rejected') {
          errors.push(`Order #${item.order_number}: ${(detail.reason as Error).message}`)
          continue
        }
        try {
          const result = await saveOrder(supabase, mapBlanxerOrder(detail.value, item.created_at))
          if (result === 'inserted') imported++
          else updated++
        } catch (err) {
          errors.push(`Order #${item.order_number}: ${(err as Error).message}`)
        }
      }
    }
  }

  if (cursorUpTo) {
    const { error: cursorError } = await supabase
      .from('blanxer_sync_state')
      .update({ last_synced_at: cursorUpTo })
      .eq('id', true)
    if (cursorError) errors.push(`Failed to advance sync cursor: ${cursorError.message}`)
  }

  return NextResponse.json({ ok: true, windows: windows.length, imported, updated, errors, lastSyncedAt: cursorUpTo })
}
