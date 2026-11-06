import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderStatus } from '@/lib/types'

// Sync moves orders forward without sending email, so an order can reach a
// status its customer was never told about. This finds those orders so staff
// can send the email by hand.
//
// Only recent orders count: older ones were moved by the 2026-10-31 reconcile
// and earlier syncs, and emailing them now would be confusing.
export const UNSENT_EMAIL_DAYS = 30

type OrderForEmailCheck = { id: string; status: OrderStatus; blanxerStatus: string | null }
type SentEmail = { orderId: string; template: string }

const DAY_MS = 24 * 60 * 60 * 1000

export function ordersMissingEmail(orders: OrderForEmailCheck[], sent: SentEmail[]): string[] {
  const sentKeys = new Set(sent.map((email) => `${email.orderId}:${email.template}`))
  return orders
    // The app shows Returned as cancelled, and the cancelled email would tell
    // the customer something untrue.
    .filter((order) => order.blanxerStatus !== 'Returned')
    // Staff don't send the Received email for synced orders. New orders are
    // already on Today as orders to dispatch.
    .filter((order) => order.status !== 'received')
    .filter((order) => !sentKeys.has(`${order.id}:${order.status}`))
    .map((order) => order.id)
}

// Works with the browser client and the cookie-based server client: both
// tables are open to logged-in staff.
export async function loadOrdersMissingEmail(supabase: SupabaseClient, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - UNSENT_EMAIL_DAYS * DAY_MS).toISOString()
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, blanxer_status')
    .not('status', 'is', null)
    .gte('created_at', since)
  if (error) throw new Error(`Failed to load orders: ${error.message}`)
  if (!orders || orders.length === 0) return []

  const { data: logs, error: logError } = await supabase
    .from('email_log')
    .select('order_id, template_used')
    .eq('type', 'transactional')
    .eq('status', 'sent')
    .in('order_id', orders.map((order) => order.id))
  if (logError) throw new Error(`Failed to load the email log: ${logError.message}`)

  return ordersMissingEmail(
    orders.map((order) => ({ id: order.id, status: order.status as OrderStatus, blanxerStatus: order.blanxer_status })),
    (logs ?? []).map((log) => ({ orderId: log.order_id as string, template: log.template_used }))
  )
}
