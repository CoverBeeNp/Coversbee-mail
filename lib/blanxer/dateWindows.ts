//
// Splits [fromIso, toIso) into consecutive month-wide windows so the sync
// route (Task 8) can page through Blanxer's date-ranged order-list endpoint
// during a full historical backfill instead of asking for years of orders
// in a single request.
export function monthWindows(fromIso: string, toIso: string): { from: string; to: string }[] {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (from.getTime() >= to.getTime()) return []

  const windows: { from: string; to: string }[] = []
  let cursor = from
  while (cursor.getTime() < to.getTime()) {
    const next = new Date(Date.UTC(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      cursor.getUTCHours(),
      cursor.getUTCMinutes(),
      cursor.getUTCSeconds()
    ))
    const windowEnd = next.getTime() < to.getTime() ? next : to
    windows.push({ from: cursor.toISOString(), to: windowEnd.toISOString() })
    cursor = next
  }
  return windows
}
