'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'

// PostgREST caps a single response at 1000 rows, so paginate through the
// full order history rather than risk missing models that only appear in
// older orders past the first page.
const PAGE_SIZE = 1000

export async function listDeviceModelOptions(): Promise<string[]> {
  await requireUser()
  const supabase = createServiceClient()
  const models = new Set<string>()

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('orders')
      .select('parsed_items')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error

    const rows = (data ?? []) as unknown as { parsed_items: { variant: string | null }[] }[]
    for (const row of rows) {
      for (const item of row.parsed_items ?? []) {
        if (item.variant) models.add(item.variant)
      }
    }
    if (rows.length < PAGE_SIZE) break
  }

  return [...models].sort()
}
