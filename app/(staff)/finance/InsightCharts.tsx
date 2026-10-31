'use client'

import Link from 'next/link'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'
import type { ReturnsSummary } from '@/lib/analytics/returns'
import type { CustomerMix } from '@/lib/analytics/customerMix'
import type { DeliverySpeed, LateOrder } from '@/lib/analytics/deliverySpeed'
import { AXIS_TICK, BAR_RADIUS_TOP, CHART } from '@/lib/chartTheme'
import { formatDays, formatPercent } from '@/lib/format'
import { blanxerStatusLabel } from '@/lib/types'

function MonthChart({ data, children }: { data: object[]; children: React.ReactNode }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <section className="card">
          <h2 className="mb-4 font-semibold">Returns and cancellations by month</h2>
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
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">New and returning customers by month</h2>
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
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Typical delivery by month</h2>
          {delivery.months.length === 0 ? (
            <NoData message="No delivery dates in this range." />
          ) : (
            <MonthChart data={delivery.months}>
              <Tooltip formatter={(value: number) => formatDays(value)} />
              <Bar dataKey="medianDays" name="Typical delivery" fill={CHART.revenue} radius={BAR_RADIUS_TOP} />
            </MonthChart>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="table-shell">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">Most lost products</h2>
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
        </section>

        <section className="table-shell">
          <h2 className="border-b border-line px-5 py-3 font-semibold text-ink">Late orders</h2>
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
        </section>
      </div>
    </div>
  )
}
