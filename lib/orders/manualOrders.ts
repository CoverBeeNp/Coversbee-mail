'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'
import { normalizePhoneModel } from './phoneModel'
import { extractColor } from './productColor'
import { nextOrderNumber } from './orderNumber'

export type ManualOrder = {
  id: string
  orderNumber: string
  customerName: string
  customerPhone: string
  productName: string
  color: string | null
  phoneModel: string | null
  qty: number
  total: number
  status: string
  orderDate: string
}

export type ManualOrderInput = {
  orderNumber: string
  customerName: string
  customerPhone: string
  productName: string
  color: string | null
  phoneModel: string | null
  qty: number
  total: number
  status: string
  orderDate: string
}

type OrderRow = {
  id: string
  order_number: string
  status: string
  total: number
  parsed_items: { name: string; color: string | null; variant: string | null; qty: number; lineTotal: number; unitPrice: number }[]
  created_at: string
  customer: { name: string; phone: string } | null
}

function fromRow(row: OrderRow): ManualOrder {
  const item = row.parsed_items[0]
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer?.name ?? 'Unknown',
    customerPhone: row.customer?.phone ?? '',
    productName: item?.name ?? '',
    color: item?.color ?? null,
    phoneModel: item?.variant ?? null,
    qty: item?.qty ?? 1,
    total: row.total,
    status: row.status,
    orderDate: row.created_at,
  }
}

const SELECT_COLUMNS = 'id, order_number:blanxer_order_number, status:blanxer_status, total, parsed_items, created_at, customer:customers(name, phone)'

// Orders synced from Blanxer are never shown or editable here — this page
// only manages sales entered by staff for orders that happened outside
// Blanxer, so mixing in synced rows would make it look like this page can
// edit them too.
export async function listManualOrders(): Promise<ManualOrder[]> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('orders')
    .select(SELECT_COLUMNS)
    .eq('source', 'manual')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as OrderRow[]).map(fromRow)
}

// Manual orders use their own "ORD-XXXX" sequence, separate from Blanxer's
// own numbering — this suggests the next number in that sequence so staff
// don't have to track it themselves, though the field stays editable in
// case they need to override it.
export async function getNextManualOrderNumber(): Promise<string> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('orders').select('order_number:blanxer_order_number').eq('source', 'manual')
  if (error) throw error
  return nextOrderNumber((data as { order_number: string }[]).map((row) => row.order_number))
}

export type PossibleDuplicate = { orderNumber: string; orderDate: string }

// A soft check, not a hard block: the same phone number and amount landing
// on the same calendar day is far more likely to be the same order typed in
// twice (e.g. staff re-entering after a page refresh) than two genuinely
// different sales, but it's still a heuristic — the caller decides whether
// to warn and let the user proceed anyway, across both sources since a
// Blanxer order re-entered here by mistake should be caught too.
export async function findPossibleDuplicate(input: {
  customerPhone: string
  total: number
  orderDate: string
}): Promise<PossibleDuplicate | null> {
  await requireUser()
  const supabase = createServiceClient()
  const day = input.orderDate.slice(0, 10)

  const { data, error } = await supabase
    .from('orders')
    .select('order_number:blanxer_order_number, created_at, total, customer:customers(phone)')
    .eq('total', input.total)
    .gte('created_at', `${day}T00:00:00.000Z`)
    .lte('created_at', `${day}T23:59:59.999Z`)
  if (error) throw error

  const rows = data as unknown as { order_number: string; created_at: string; customer: { phone: string } | null }[]
  const match = rows.find((row) => row.customer?.phone === input.customerPhone)
  return match ? { orderNumber: match.order_number, orderDate: match.created_at } : null
}

export async function createManualOrder(input: ManualOrderInput): Promise<ManualOrder> {
  await requireUser()
  const supabase = createServiceClient()

  // An order number already used by either a Blanxer-synced order or
  // another manual entry means this is the same order being entered twice
  // — reject it instead of creating a duplicate.
  const { data: existing, error: existingError } = await supabase
    .from('orders')
    .select('id')
    .eq('blanxer_order_number', input.orderNumber)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) throw new Error(`Order number ${input.orderNumber} already exists`)

  // limit(1) because phone isn't unique; a duplicate must not block the order.
  let customerId: string
  const { data: existingCustomers, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', input.customerPhone)
    .order('created_at', { ascending: true })
    .limit(1)
  if (customerError) throw customerError

  const existingCustomer = existingCustomers?.[0]
  if (existingCustomer) {
    customerId = existingCustomer.id
  } else {
    const { data: createdCustomer, error: createCustomerError } = await supabase
      .from('customers')
      .insert({ name: input.customerName, phone: input.customerPhone, subscribed_to_marketing: false })
      .select('id')
      .single()
    if (createCustomerError) throw createCustomerError
    customerId = createdCustomer.id
  }

  // Staff can name the color explicitly now, but older callers (and any
  // product name still typed as "Brown Silicon") fall back to splitting a
  // leading color word off the name, same as before this field existed.
  const { color: extractedColor, baseName } = extractColor(input.productName)
  const color = input.color ?? extractedColor
  const phoneModel = normalizePhoneModel(input.phoneModel)

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      blanxer_order_number: input.orderNumber,
      customer_id: customerId,
      // Sold outside Blanxer, so there is nothing for the email workflow to track.
      status: null,
      blanxer_status: input.status,
      subtotal: input.total,
      delivery_charge: 0,
      total: input.total,
      parsed_items: [
        { name: baseName, color, variant: phoneModel, qty: input.qty, unitPrice: input.total / input.qty, lineTotal: input.total },
      ],
      created_at: input.orderDate,
      source: 'manual',
    })
    .select(SELECT_COLUMNS)
    .single()
  if (orderError) throw orderError

  return fromRow({ ...(order as unknown as OrderRow), customer: { name: input.customerName, phone: input.customerPhone } })
}

// Scoped to source = 'manual' so this can never delete a Blanxer-synced
// order, even if called with the wrong id — synced orders are only ever
// removed by Blanxer itself, not from this app.
export async function deleteManualOrder(id: string): Promise<void> {
  await requireUser()
  const supabase = createServiceClient()
  const { error } = await supabase.from('orders').delete().eq('id', id).eq('source', 'manual')
  if (error) throw error
}
