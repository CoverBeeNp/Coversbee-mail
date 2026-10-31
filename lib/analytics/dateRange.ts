// Compares only the calendar-date portion (YYYY-MM-DD) so a full order
// timestamp ("2026-08-15T23:59:59.000Z") and a plain expense date
// ("2026-08-15") both compare correctly against the same "from"/"to"
// bounds — both are "to" inclusive of the whole day.
export function isWithinRange(dateIso: string, from: string | undefined, to: string | undefined): boolean {
  const date = dateIso.slice(0, 10)
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}
