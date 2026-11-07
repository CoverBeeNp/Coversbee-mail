'use client'

import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { DayPoint, FollowerPoint } from '@/lib/instagram/summary'
import { formatDate } from '@/lib/format'
import { AXIS_TICK, BAR_RADIUS_TOP, CHART } from '@/lib/chartTheme'

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function DayTooltip({ active, payload, metric: name }: { active?: boolean; payload?: { payload: DayPoint }[]; metric: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const value = name === 'Orders' ? row.orders : name === 'Reach' ? row.reach : row.views
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold">{formatDate(row.day)}</p>
      <p className="text-ink-soft">{name}: {value === null ? 'Not read yet' : value.toLocaleString()}</p>
    </div>
  )
}

// Reach and orders are different scales, so they get a chart each, one above
// the other on the same days, rather than two axes on one chart.
function DayBars({ data, dataKey, name, fill }: { data: DayPoint[]; dataKey: 'reach' | 'views' | 'orders'; name: string; fill: string }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="day" tickFormatter={shortDay} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={24} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={50} tickFormatter={(v: number) => v.toLocaleString()} />
        <Tooltip cursor={{ fill: CHART.grid, opacity: 0.5 }} content={<DayTooltip metric={name} />} />
        <Bar dataKey={dataKey} name={name} fill={fill} radius={BAR_RADIUS_TOP} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function InstagramCharts({ days, followerHistory }: { days: DayPoint[]; followerHistory: FollowerPoint[] }) {
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="font-semibold">Reach and orders by day</h2>
        <p className="mb-4 text-sm text-muted">Accounts reached on Instagram each day, with that day&rsquo;s orders below it.</p>
        <p className="mb-1 text-xs font-semibold text-muted">Reach</p>
        <DayBars data={days} dataKey="reach" name="Reach" fill={CHART.audience} />
        <p className="mb-1 mt-4 text-xs font-semibold text-muted">Orders</p>
        <DayBars data={days} dataKey="orders" name="Orders" fill={CHART.orders} />
      </section>

      <section className="card">
        <h2 className="font-semibold">Views by day</h2>
        <p className="mb-4 text-sm text-muted">Times your posts, reels and stories were seen, including repeat views.</p>
        <DayBars data={days} dataKey="views" name="Views" fill={CHART.audience} />
      </section>

      <section className="card">
        <h2 className="font-semibold">Followers</h2>
        {followerHistory.length >= 2 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={followerHistory}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={24} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={60} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString()} />
              <Tooltip labelFormatter={(day: string) => formatDate(day)} formatter={(v: number) => [v.toLocaleString(), 'Followers']} />
              <Line type="monotone" dataKey="followers" stroke={CHART.audience} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Instagram only gives today&rsquo;s follower count, so the app saves it each day. The chart appears after the second day.
          </p>
        )}
      </section>
    </div>
  )
}
