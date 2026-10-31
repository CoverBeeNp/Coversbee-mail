// The one way a headline figure is shown across the app. Only profit-like
// figures take colour, and only to show whether they're above or below zero.
export function StatTile({
  label,
  value,
  tone = 'plain',
  note,
  size = 'regular',
}: {
  label: string
  value: string
  tone?: 'plain' | 'positive' | 'negative'
  note?: string | null
  size?: 'regular' | 'small'
}) {
  const valueClass = tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'
  return (
    <div className={`rounded-2xl border border-line bg-surface ${size === 'small' ? 'px-4 py-3' : 'px-5 py-4'}`}>
      <p className={size === 'small' ? 'text-xs text-muted' : 'text-sm text-muted'}>{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${size === 'small' ? 'text-lg' : 'text-2xl'} ${valueClass}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  )
}

export function signedTone(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive'
}
