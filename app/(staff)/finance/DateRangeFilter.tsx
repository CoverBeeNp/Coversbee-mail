import Link from 'next/link'

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function buildPresets(): { label: string; from: string; to: string }[] {
  const now = new Date()
  const today = isoDate(now)
  const startOfMonth = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  const last3MonthsStart = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)))
  const startOfYear = isoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)))

  return [
    { label: 'This month', from: startOfMonth, to: today },
    { label: 'Last 3 months', from: last3MonthsStart, to: today },
    { label: 'This year', from: startOfYear, to: today },
  ]
}

export function DateRangeFilter({ from, to }: { from?: string; to?: string }) {
  const hasFilter = Boolean(from || to)
  const presets = buildPresets()

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-4" action="/" method="get">
        <div>
          <label className="field-label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from} className="field-input" />
        </div>
        <div>
          <label className="field-label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className="field-input" />
        </div>
        <button type="submit" className="btn-primary">
          Filter
        </button>
      </form>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Link href="/finance" className={hasFilter ? 'btn-outline' : 'btn-primary'}>
          All time
        </Link>
        {presets.map((preset) => {
          const active = from === preset.from && to === preset.to
          return (
            <Link
              key={preset.label}
              href={`/finance?from=${preset.from}&to=${preset.to}`}
              className={active ? 'btn-primary' : 'btn-outline'}
            >
              {preset.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
