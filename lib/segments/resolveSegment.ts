import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'

export type SegmentFilter = { type: 'all_subscribed' } | { type: 'recent_customers'; days: number }

export function matchesSegment(
  customer: { subscribedToMarketing: boolean; lastOrderAt: string | null },
  filter: SegmentFilter,
  now: Date
): boolean {
  if (!customer.subscribedToMarketing) return false
  if (filter.type === 'all_subscribed') return true
  if (!customer.lastOrderAt) return false
  const cutoff = new Date(now.getTime() - filter.days * 24 * 60 * 60 * 1000)
  return new Date(customer.lastOrderAt) >= cutoff
}

export async function resolveSegmentCustomerIds(supabase: SupabaseClient, filter: SegmentFilter): Promise<string[]> {
  const customers = await fetchAllRows<{ id: string; subscribed_to_marketing: boolean }>(
    supabase, 'customers', 'id, subscribed_to_marketing', 'created_at'
  )
  const orders = await fetchAllRows<{ customer_id: string | null; created_at: string }>(
    supabase, 'orders', 'customer_id, created_at', 'created_at'
  )

  // Rows arrive oldest first, so each customer ends on their latest order.
  const lastOrderByCustomer = new Map<string, string>()
  for (const order of orders) {
    if (order.customer_id) lastOrderByCustomer.set(order.customer_id, order.created_at)
  }

  const now = new Date()
  return customers
    .filter((c) => matchesSegment({ subscribedToMarketing: c.subscribed_to_marketing, lastOrderAt: lastOrderByCustomer.get(c.id) ?? null }, filter, now))
    .map((c) => c.id)
}
