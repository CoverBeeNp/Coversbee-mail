'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseBlanxerOrder, formatAddress, type ParsedOrder } from '@/lib/parser/blanxerParser'

export async function parseOrder(rawText: string): Promise<ParsedOrder> {
  return parseBlanxerOrder(rawText)
}

export async function saveOrder(input: { rawPastedText: string; parsed: ParsedOrder }): Promise<{ orderId: string }> {
  const supabase = createServiceClient()
  const { parsed, rawPastedText } = input

  let customerId: string
  const existing = parsed.customerPhone
    ? await supabase.from('customers').select('id, name, email').eq('phone', parsed.customerPhone).maybeSingle()
    : parsed.customerEmail
    ? await supabase.from('customers').select('id, name, email').eq('email', parsed.customerEmail).maybeSingle()
    : { data: null, error: null }

  if (existing.error) throw existing.error

  if (existing.data) {
    customerId = existing.data.id

    // Blanxer's Email field can be blank on a first order, so a matched
    // customer's email (or, less commonly, name) can be permanently null
    // unless a later order carries it. Backfill only null/empty fields —
    // never overwrite an existing non-null value with a different one, to
    // avoid clobbering legitimate existing data.
    const patch: Record<string, string> = {}
    if (parsed.customerEmail && !existing.data.email) patch.email = parsed.customerEmail
    // customers.name is NOT NULL — a customer created without a parsed name
    // gets the 'Unknown' sentinel (see the insert below), so treat that as
    // empty too rather than only a literal null/''.
    if (parsed.customerName && (!existing.data.name || existing.data.name === 'Unknown')) patch.name = parsed.customerName
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase.from('customers').update(patch).eq('id', customerId)
      if (updateError) throw updateError
    }
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
      address: formatAddress(parsed),
      tracking_url: parsed.trackingUrl,
    })
    .select('id')
    .single()
  if (orderError) throw orderError

  return { orderId: order.id }
}
