import type { SupabaseClient } from '@supabase/supabase-js'

// PostgREST caps a single response at 1000 rows, so every row has to be read
// in explicitly ordered pages. Without an `order by` the server is free to
// return a different arbitrary 1000 rows on each request.
//
// A failed page throws rather than returning what was read so far: partial
// data would silently understate revenue, freeze wrong numbers into a monthly
// statement.
const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderColumn: string
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to load ${table}: ${error.message}`)
    const page = (data ?? []) as unknown as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}
