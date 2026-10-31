import type { SupabaseClient } from '@supabase/supabase-js'
import { exchangeBlanxerApiKey, listBlanxerOrders, getBlanxerOrderDetail } from '@/lib/blanxer/client'
import { mapBlanxerOrder } from '@/lib/blanxer/mapOrder'
import { monthWindows } from '@/lib/blanxer/dateWindows'
import { saveOrder } from '@/lib/orders/saveOrder'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'
import type { BlanxerOrderListItem } from '@/lib/blanxer/types'

// Before the store's first Blanxer order, so the whole history is always read.
const HISTORY_START = '2025-01-01T00:00:00.000Z'
const LIST_BATCH_SIZE = 5
const DETAIL_BATCH_SIZE = 5

export type SyncResult = {
  listed: number
  imported: number
  updated: number
  remaining: number
  errors: string[]
  complete: boolean
}

type StoredOrder = { blanxer_id: string | null; blanxer_updated_at: string | null }

function isUnchanged(item: BlanxerOrderListItem, stored: StoredOrder | undefined): boolean {
  if (!stored?.blanxer_updated_at || !item.updated_at) return false
  return new Date(stored.blanxer_updated_at).getTime() === new Date(item.updated_at).getTime()
}

// Makes this project match Blanxer. Listing the full history is cheap, so every
// sync compares every order and fetches details only for those that changed.
// Nothing is ever deleted: an order missing from Blanxer stays here.
//
// `deadline` lets a caller with a time limit stop early. Unfinished orders are
// still marked as changed, so the next run picks them up.
export async function syncFromBlanxer(
  supabase: SupabaseClient,
  apiKey: string,
  options: { now: Date; deadline?: number }
): Promise<SyncResult> {
  const { token, storeId } = await exchangeBlanxerApiKey(apiKey)
  const errors: string[] = []

  const windows = monthWindows(HISTORY_START, options.now.toISOString())
  const listed: BlanxerOrderListItem[] = []
  let listFailed = false
  for (let i = 0; i < windows.length; i += LIST_BATCH_SIZE) {
    const batch = windows.slice(i, i + LIST_BATCH_SIZE)
    const pages = await Promise.allSettled(batch.map((w) => listBlanxerOrders(token, storeId, w.from, w.to)))
    pages.forEach((page, index) => {
      if (page.status === 'fulfilled') listed.push(...page.value)
      else {
        listFailed = true
        errors.push(`Window ${batch[index].from}: ${(page.reason as Error).message}`)
      }
    })
  }

  const stored = await fetchAllRows<StoredOrder>(supabase, 'orders', 'id, blanxer_id, blanxer_updated_at', 'created_at')
  const storedById = new Map(stored.map((row) => [row.blanxer_id, row]))

  // New orders first, so a time limit can't hold them back behind updates.
  const changed = listed
    .filter((item) => !isUnchanged(item, storedById.get(item._id)))
    .sort((a, b) => Number(storedById.has(a._id)) - Number(storedById.has(b._id)))

  let imported = 0
  let updated = 0
  let processed = 0

  for (let i = 0; i < changed.length; i += DETAIL_BATCH_SIZE) {
    if (options.deadline && Date.now() > options.deadline) break
    const batch = changed.slice(i, i + DETAIL_BATCH_SIZE)
    const details = await Promise.allSettled(batch.map((item) => getBlanxerOrderDetail(token, storeId, item._id)))

    // Details are fetched in parallel, but saved one at a time so two orders
    // from one new customer can't both create that customer.
    for (const [index, detail] of details.entries()) {
      const item = batch[index]
      processed++
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

  const remaining = changed.length - processed
  const complete = !listFailed && remaining === 0 && errors.length === 0
  if (complete) {
    const { error } = await supabase
      .from('blanxer_sync_state')
      .update({ last_synced_at: options.now.toISOString() })
      .eq('id', true)
    if (error) errors.push(`Failed to record the sync time: ${error.message}`)
  }

  return { listed: listed.length, imported, updated, remaining, errors, complete }
}
