// The one way a headline figure is shown across the app. Only profit-like
// figures take colour, and only to show whether they're above or below zero.
export function StatTile({
  label,
  value,
  tone = 'plain',
  note,
}: {
  label: string
  value: string
  tone?: 'plain' | 'positive' | 'negative'
  note?: string | null
}) {
  const valueClass = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  )
}

export function signedTone(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive'
}
