'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseBlanxerOrder, type ParsedOrder } from '@/lib/parser/blanxerParser'

export async function parseOrder(rawText: string): Promise<ParsedOrder> {
  return parseBlanxerOrder(rawText)
}

export async function saveOrder(input: { rawPastedText: string; parsed: ParsedOrder }): Promise<{ orderId: string }> {
  const supabase = createServiceClient()
  const { parsed, rawPastedText } = input

  let customerId: string
  const existing = parsed.customerPhone
    ? await supabase.from('customers').select('id').eq('phone', parsed.customerPhone).maybeSingle()
    : parsed.customerEmail
    ? await supabase.from('customers').select('id').eq('email', parsed.customerEmail).maybeSingle()
    : { data: null }

  if (existing.data) {
    customerId = existing.data.id
  } else {
    const { data: created, error } = await supabase
      .from('customers')
      .insert({ name: parsed.customerName ?? 'Unknown', phone: parsed.customerPhone, email: parsed.customerEmail })
      .select('id')
      .single()
    if (error) throw error
    customerId = created.id
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id: customerId,
      raw_pasted_text: rawPastedText,
      parsed_items: parsed.items,
      total: parsed.total,
      status: 'received',
      blanxer_order_number: parsed.blanxerOrderNumber,
    })
    .select('id')
    .single()
  if (orderError) throw orderError

  return { orderId: order.id }
}
