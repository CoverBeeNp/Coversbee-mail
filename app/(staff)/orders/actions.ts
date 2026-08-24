'use server'
import { createServiceClient } from '@/lib/supabase/server'
import { parseBlanxerOrder, type ParsedOrder } from '@/lib/parser/blanxerParser'
import { saveParsedOrder } from '@/lib/orders/saveParsedOrder'

export async function parseOrder(rawText: string): Promise<ParsedOrder> {
  return parseBlanxerOrder(rawText)
}

export async function saveOrder(input: { rawPastedText: string; parsed: ParsedOrder }): Promise<{ orderId: string }> {
  const supabase = createServiceClient()
  return saveParsedOrder(supabase, { parsed: input.parsed, rawPastedText: input.rawPastedText })
}
