import type { SupabaseClient } from '@supabase/supabase-js'
import type { MappedOrder } from '@/lib/blanxer/mapOrder'
import type { OrderStatus } from '@/lib/types'
import { workflowStatusFromBlanxer } from './workflowStatus'

export type SaveResult = 'inserted' | 'updated'

type CustomerRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  blanxer_customer_id: string | null
}

const CUSTOMER_COLUMNS = 'id, name, email, phone, blanxer_customer_id'

// limit(1) rather than maybeSingle(): customers.phone and email aren't unique,
// and a duplicate must not stop the whole order from syncing. Oldest row wins
// so repeated syncs always pick the same customer.
async function findCustomer(supabase: SupabaseClient, column: string, value: string): Promise<CustomerRow | null> {
  const { data, error } = await supabase
    .from('customers')
    .select(CUSTOMER_COLUMNS)
    .eq(column, value)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return (data?.[0] as CustomerRow | undefined) ?? null
}

// Matches on Blanxer's customer id, then phone, then email. Only empty fields
// are filled in, and subscribed_to_marketing is never written, so a sync can't
// overwrite staff edits or undo an unsubscribe.
async function resolveCustomerId(supabase: SupabaseClient, order: MappedOrder): Promise<string | null> {
  const existing =
    (order.blanxerCustomerId ? await findCustomer(supabase, 'blanxer_customer_id', order.blanxerCustomerId) : null) ??
    (order.customerPhone ? await findCustomer(supabase, 'phone', order.customerPhone) : null) ??
    (order.customerEmail ? await findCustomer(supabase, 'email', order.customerEmail) : null)

  if (existing) {
    const patch: Record<string, string> = {}
    if (order.blanxerCustomerId && !existing.blanxer_customer_id) patch.blanxer_customer_id = order.blanxerCustomerId
    if (order.customerEmail && !existing.email) patch.email = order.customerEmail
    if (order.customerPhone && !existing.phone) patch.phone = order.customerPhone
    // customers.name is NOT NULL, so 'Unknown' is the stored form of "no name".
    if (order.customerName && (!existing.name || existing.name === 'Unknown')) patch.name = order.customerName
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('customers').update(patch).eq('id', existing.id)
      if (error) throw error
    }
    return existing.id
  }

  if (!order.blanxerCustomerId && !order.customerPhone && !order.customerEmail) return null

  const { data, error } = await supabase
    .from('customers')
    .insert({
      blanxer_customer_id: order.blanxerCustomerId,
      name: order.customerName ?? 'Unknown',
      phone: order.customerPhone,
      email: order.customerEmail,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

type ExistingOrder = { id: string; customer_id: string | null; status: OrderStatus | null }

// An order saved before it had a blanxer_id is matched by its order number, so
// a sync links it instead of hitting the unique index on that number.
async function findOrder(supabase: SupabaseClient, order: MappedOrder): Promise<ExistingOrder | null> {
  const byBlanxerId = await supabase
    .from('orders')
    .select('id, customer_id, status')
    .eq('blanxer_id', order.blanxerId)
    .maybeSingle()
  if (byBlanxerId.error) throw byBlanxerId.error
  if (byBlanxerId.data) return byBlanxerId.data

  const byNumber = await supabase
    .from('orders')
    .select('id, customer_id, status')
    .eq('blanxer_order_number', order.orderNumber)
    .is('blanxer_id', null)
    .maybeSingle()
  if (byNumber.error) throw byNumber.error
  return byNumber.data
}

// Writes one Blanxer order. Blanxer is the source of truth, so its status also
// moves the workflow status, without sending an email: `status` only says where
// the order is, and email_log records what was actually sent. Blanxer's own
// wording stays in blanxer_status. See lib/orders/workflowStatus.ts.
export async function saveOrder(supabase: SupabaseClient, order: MappedOrder): Promise<SaveResult> {
  const customerId = await resolveCustomerId(supabase, order)
  const existing = await findOrder(supabase, order)

  const blanxerFields = {
    blanxer_id: order.blanxerId,
    blanxer_order_number: order.orderNumber,
    blanxer_status: order.status,
    blanxer_updated_at: order.blanxerUpdatedAt,
    created_at: order.createdAt,
    subtotal: order.subtotal,
    delivery_charge: order.deliveryCharge,
    total: order.total,
    parsed_items: order.items,
    // Omitted when empty so a re-check can't blank a value already stored.
    ...(order.address ? { address: order.address } : {}),
    ...(order.trackingUrl ? { tracking_url: order.trackingUrl } : {}),
  }

  if (existing) {
    const status = workflowStatusFromBlanxer(existing.status, order.status)
    const { error } = await supabase
      .from('orders')
      .update({
        ...blanxerFields,
        ...(existing.customer_id ? {} : { customer_id: customerId }),
        ...(status === existing.status ? {} : { status, status_updated_at: new Date().toISOString() }),
      })
      .eq('id', existing.id)
    if (error) throw error
    return 'updated'
  }

  const { error } = await supabase
    .from('orders')
    .insert({
      ...blanxerFields,
      customer_id: customerId,
      status: workflowStatusFromBlanxer('received', order.status),
      source: 'blanxer',
    })
  if (error) throw error
  return 'inserted'
}
