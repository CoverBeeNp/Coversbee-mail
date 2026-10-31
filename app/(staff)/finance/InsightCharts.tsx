'use client'

import Link from 'next/link'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import type { ReturnsSummary } from '@/lib/analytics/returns'
import type { CustomerMix } from '@/lib/analytics/customerMix'
import type { DeliverySpeed, LateOrder } from '@/lib/analytics/deliverySpeed'
import { LATE_AFTER_DAYS } from '@/lib/analytics/deliverySpeed'
import { AXIS_TICK, BAR_RADIUS_TOP, CHART } from '@/lib/chartTheme'
import { formatPercent } from '@/lib/format'
import { blanxerStatusLabel } from '@/lib/types'
import { StatTile } from '../StatTile'

function formatDays(days: number | null): string {
  return days === null ? '—' : `${days.toFixed(1)} days`
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="text-sm text-muted">{description}</p>
    </div>
  )
}

function MonthChart({ data, children }: { data: object[]; children: React.ReactNode }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        {children}
      </BarChart>
    </ResponsiveContainer>
  )
}

function NoData({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm text-muted">{message}</p>
}

export function InsightCharts({
  returns,
  customers,
  delivery,
  late,
}: {
  returns: ReturnsSummary
  customers: CustomerMix
  delivery: DeliverySpeed
  late: LateOrder[]
}) {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <SectionHeading title="Returns and cancellations" description="Orders that didn't turn into a sale, by the month they were placed." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Lost orders" value={formatPercent(returns.lostPercent)} note={`of ${returns.orders.toLocaleString()} orders`} />
          <StatTile label="Cancelled" value={returns.cancelled.toLocaleString()} />
          <StatTile label="Returned" value={returns.returned.toLocaleString()} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card lg:col-span-2">
            <h3 className="mb-4 font-semibold">By month</h3>
            {returns.cancelled + returns.returned === 0 ? (
              <NoData message="No cancelled or returned orders in this range." />
            ) : (
              <MonthChart data={returns.months}>
                <Tooltip />
                <Legend />
                <Bar dataKey="cancelled" name="Cancelled" stackId="lost" fill={CHART.revenue} stroke={CHART.surface} strokeWidth={2} />
                <Bar dataKey="returned" name="Returned" stackId="lost" fill={CHART.expenses} stroke={CHART.surface} strokeWidth={2} radius={BAR_RADIUS_TOP} />
              </MonthChart>
            )}
          </div>
          <div className="table-shell self-start">
            <h3 className="border-b border-line px-5 py-3 font-semibold text-ink">Most lost products</h3>
            {returns.products.length === 0 ? (
              <NoData message="Nothing lost in this range." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units</th>
                    <th>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.products.map((product) => (
                    <tr key={product.name}>
                      <td className="text-ink">{product.name}</td>
                      <td className="tabular-nums text-ink-soft">{product.unitsLost}</td>
                      <td className="tabular-nums text-ink-soft">{formatPercent(product.lostPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="New and returning customers" description="Customers who bought each month. Returning means they had bought in an earlier month." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="New customers" value={customers.newCustomers.toLocaleString()} />
          <StatTile label="Returning customers" value={customers.returningCustomers.toLocaleString()} />
          <StatTile label="Returning share" value={formatPercent(customers.returningPercent)} />
        </div>
        <div className="card">
          <h3 className="mb-4 font-semibold">By month</h3>
          {customers.months.length === 0 ? (
            <NoData message="No customers in this range." />
          ) : (
            <MonthChart data={customers.months}>
              <Tooltip />
              <Legend />
              <Bar dataKey="newCustomers" name="New" stackId="customers" fill={CHART.revenue} stroke={CHART.surface} strokeWidth={2} />
              <Bar dataKey="returningCustomers" name="Returning" stackId="customers" fill={CHART.profit} stroke={CHART.surface} strokeWidth={2} radius={BAR_RADIUS_TOP} />
            </MonthChart>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Delivery speed" description="Time from placing an order to its delivery." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Typical delivery" value={formatDays(delivery.medianDays)} note={`Median of ${delivery.measured.toLocaleString()} orders`} />
          <StatTile label="90% arrive within" value={formatDays(delivery.p90Days)} />
          <StatTile label="Late right now" value={late.length.toLocaleString()} tone={late.length > 0 ? 'negative' : 'plain'} note={`Open over ${LATE_AFTER_DAYS} days`} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card lg:col-span-2">
            <h3 className="mb-4 font-semibold">Typical delivery by month</h3>
            {delivery.months.length === 0 ? (
              <NoData message="No delivery dates in this range." />
            ) : (
              <MonthChart data={delivery.months}>
                <Tooltip formatter={(value: number) => formatDays(value)} />
                <Bar dataKey="medianDays" name="Typical delivery" fill={CHART.revenue} radius={BAR_RADIUS_TOP} />
              </MonthChart>
            )}
          </div>
          <div className="table-shell self-start">
            <h3 className="border-b border-line px-5 py-3 font-semibold text-ink">Late orders</h3>
            {late.length === 0 ? (
              <NoData message="No late orders." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Blanxer status</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {late.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/orders/${order.id}`} className="font-semibold text-ink hover:text-gold-dark">#{order.orderNumber}</Link>
                      </td>
                      <td className="text-ink-soft">{blanxerStatusLabel(order.status)}</td>
                      <td className="whitespace-nowrap tabular-nums text-ink-soft">{order.ageDays.toFixed(0)} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
