'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell,
} from 'recharts'
import type { MonthlySummary } from '@/lib/analytics/monthly'
import { seasonality, type SeasonalityRow } from '@/lib/analytics/seasonality'
import type { ProductPerformance } from '@/lib/analytics/products'
import type { DeviceModelPerformance } from '@/lib/analytics/deviceModels'
import type { ColorPerformance } from '@/lib/analytics/colorPerformance'
import type { ExpenseBreakdownRow } from '@/lib/analytics/expenseBreakdown'
import { formatAmount } from '@/lib/format'
import { AXIS_TICK, BAR_RADIUS_END, BAR_RADIUS_TOP, CHART } from '@/lib/chartTheme'

const CALENDAR_MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ALL_YEARS = 'all'

type Metric = 'revenue' | 'unitsSold'
type SeasonalityDatum = SeasonalityRow & { label: string }

function MetricTabs({ metric, onChange }: { metric: Metric; onChange: (metric: Metric) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line p-0.5 text-xs">
      {(['revenue', 'unitsSold'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full px-3 py-1 font-semibold transition-colors ${
            metric === option ? 'bg-ink text-gold' : 'text-muted hover:text-ink'
          }`}
        >
          {option === 'revenue' ? 'Revenue' : 'Units sold'}
        </button>
      ))}
    </div>
  )
}

// A custom tooltip, because the plain default one can't show which years
// went into a bar's average — and with partial history, one calendar month
// might average two years while its neighbor only ever occurred once, which
// looks directly comparable in the chart but isn't unless you know that.
function SeasonalityTooltip({
  active,
  payload,
  metric,
  year,
}: {
  active?: boolean
  payload?: { payload: SeasonalityDatum }[]
  metric: Metric
  year: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const valueLabel = metric === 'revenue' ? 'Revenue' : 'Units sold'
  const contextLabel =
    year !== ALL_YEARS
      ? year
      : row.years.length === 0
        ? 'No data'
        : row.years.length === 1
          ? `Based on ${row.years[0]} only`
          : `Average of ${row.years.join(', ')}`

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold">{row.label}</p>
      <p className="text-ink-soft">{valueLabel}: {metric === 'revenue' ? formatAmount(row.average) : row.average.toLocaleString()}</p>
      <p className="text-muted">{contextLabel}</p>
    </div>
  )
}

export function DashboardCharts({
  monthly,
  products,
  deviceModels,
  colors,
  breakdown,
  productsByModel,
  colorsByModel,
}: {
  monthly: MonthlySummary[]
  products: ProductPerformance[]
  deviceModels: DeviceModelPerformance[]
  colors: ColorPerformance[]
  breakdown: ExpenseBreakdownRow[]
  productsByModel: Record<string, ProductPerformance[]>
  colorsByModel: Record<string, ColorPerformance[]>
}) {
  const [seasonalityMetric, setSeasonalityMetric] = useState<Metric>('revenue')
  const [seasonalityYear, setSeasonalityYear] = useState<string>(ALL_YEARS)
  const [productsMetric, setProductsMetric] = useState<Metric>('revenue')
  const [colorsMetric, setColorsMetric] = useState<Metric>('revenue')
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  function handleModelClick(model: string) {
    setSelectedModel((current) => (current === model ? null : model))
  }

  const availableYears = useMemo(
    () => [...new Set(monthly.map((row) => row.month.slice(0, 4)))].sort().reverse(),
    [monthly]
  )

  const seasonalityRows = useMemo(() => {
    const source = seasonalityYear === ALL_YEARS ? monthly : monthly.filter((row) => row.month.startsWith(seasonalityYear))
    return seasonality(source, seasonalityMetric)
  }, [monthly, seasonalityMetric, seasonalityYear])

  const seasonalityData: SeasonalityDatum[] = seasonalityRows.map((row) => ({
    ...row,
    label: CALENDAR_MONTH_LABEL[row.calendarMonth - 1],
  }))
  const hasMultiYearMonth = seasonalityYear === ALL_YEARS && seasonalityData.some((row) => row.years.length > 1)

  const displayedProducts = selectedModel ? (productsByModel[selectedModel] ?? []) : products
  const displayedColors = selectedModel ? (colorsByModel[selectedModel] ?? []) : colors
  const sortedProducts = [...displayedProducts].sort((a, b) => b[productsMetric] - a[productsMetric]).slice(0, 10)
  const sortedColors = [...displayedColors].sort((a, b) => b[colorsMetric] - a[colorsMetric]).slice(0, 6)

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-4 font-semibold">Revenue, expenses & profit by month</h2>
        {monthly.length === 0 ? (
          <EmptyChart message="No orders or expenses yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthly}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} width={70} />
              <Tooltip formatter={(value: number) => formatAmount(value)} />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill={CHART.revenue} radius={BAR_RADIUS_TOP} />
              <Bar dataKey="expenses" name="Expenses" fill={CHART.expenses} radius={BAR_RADIUS_TOP} />
              <Bar dataKey="profit" name="Profit" fill={CHART.profit} radius={BAR_RADIUS_TOP} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Seasonality by calendar month</h2>
            <div className="flex items-center gap-2">
              <select
                className="field-input h-8 w-28 py-0 text-xs"
                value={seasonalityYear}
                onChange={(e) => setSeasonalityYear(e.target.value)}
              >
                <option value={ALL_YEARS}>All years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <MetricTabs metric={seasonalityMetric} onChange={setSeasonalityMetric} />
            </div>
          </div>
          {seasonalityData.every((row) => row.average === 0) ? (
            <EmptyChart message="Not enough order history yet to see a seasonal pattern." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={seasonalityData}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} width={60} />
                  <Tooltip content={<SeasonalityTooltip metric={seasonalityMetric} year={seasonalityYear} />} />
                  <Bar dataKey="average" fill={CHART.revenue} radius={BAR_RADIUS_TOP}>
                    {seasonalityData.map((row, i) => (
                      <Cell key={i} fillOpacity={row.years.length > 1 ? 1 : 0.4} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {hasMultiYearMonth && (
                <p className="mt-2 text-xs text-muted">
                  Lighter bars are based on a single year of data so far; full-color bars average two or more years.
                </p>
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">Expense breakdown</h2>
          {breakdown.length === 0 ? (
            <EmptyChart message="No expenses logged yet." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, breakdown.length * 36)}>
              <BarChart data={[...breakdown].sort((a, b) => b.total - a.total)} layout="vertical">
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} />
                <YAxis dataKey="categoryName" type="category" width={150} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                <Tooltip formatter={(value: number) => formatAmount(value)} />
                <Bar dataKey="total" name="Spent" fill={CHART.expenses} radius={BAR_RADIUS_END} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Top colors{selectedModel ? ` for ${selectedModel}` : ''}
            </h2>
            <MetricTabs metric={colorsMetric} onChange={setColorsMetric} />
          </div>
          {displayedColors.length === 0 ? (
            <EmptyChart message={selectedModel ? `No color data for ${selectedModel} yet.` : 'No recognized colors in the order data yet.'} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, sortedColors.length * 40)}>
              <BarChart data={sortedColors} layout="vertical">
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} />
                <YAxis dataKey="color" type="category" width={90} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                <Tooltip formatter={(value: number) => (colorsMetric === 'revenue' ? formatAmount(value) : value.toLocaleString())} />
                <Bar dataKey={colorsMetric} fill={CHART.revenue} radius={BAR_RADIUS_END} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Top products{selectedModel ? ` for ${selectedModel}` : ''}
            </h2>
            <MetricTabs metric={productsMetric} onChange={setProductsMetric} />
          </div>
          {displayedProducts.length === 0 ? (
            <EmptyChart message={selectedModel ? `No product data for ${selectedModel} yet.` : 'No product sales yet.'} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, sortedProducts.length * 40)}>
              <BarChart data={sortedProducts} layout="vertical">
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} />
                <YAxis dataKey="name" type="category" width={140} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                <Tooltip formatter={(value: number) => (productsMetric === 'revenue' ? formatAmount(value) : value.toLocaleString())} />
                <Bar dataKey={productsMetric} fill={CHART.revenue} radius={BAR_RADIUS_END} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Top device models by units sold</h2>
            {selectedModel && (
              <button type="button" className="text-xs font-semibold text-gold-dark hover:underline" onClick={() => setSelectedModel(null)}>
                Clear selection
              </button>
            )}
          </div>
          {deviceModels.length === 0 ? (
            <EmptyChart message="No device models recognized in the order data yet." />
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">Click a bar to see its products and colors on the left.</p>
              <ResponsiveContainer width="100%" height={Math.max(200, deviceModels.length * 40)}>
                <BarChart data={deviceModels} layout="vertical">
                  <CartesianGrid horizontal={false} stroke={CHART.grid} />
                  <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(value: number) => value.toLocaleString()} />
                  <YAxis dataKey="model" type="category" width={140} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                  <Tooltip />
                  <Bar
                    dataKey="unitsSold"
                    fill={CHART.revenue}
                    radius={BAR_RADIUS_END}
                    cursor="pointer"
                    onClick={(data) => handleModelClick((data as unknown as DeviceModelPerformance).model)}
                  >
                    {deviceModels.map((row, i) => (
                      <Cell key={i} fillOpacity={selectedModel && row.model !== selectedModel ? 0.35 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted">
      {message}
    </div>
  )
}
