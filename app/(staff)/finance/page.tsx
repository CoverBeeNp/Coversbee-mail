import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'
import { getBankBalance } from '@/lib/bankBalance/bankBalance'
import { monthlySummary } from '@/lib/analytics/monthly'
import { productPerformance, type ProductPerformance } from '@/lib/analytics/products'
import { deviceModelPerformance, extractModel } from '@/lib/analytics/deviceModels'
import { colorPerformance, type ColorPerformance } from '@/lib/analytics/colorPerformance'
import { normalizeKey } from '@/lib/analytics/nameGrouping'
import { expenseBreakdown } from '@/lib/analytics/expenseBreakdown'
import { isWithinRange } from '@/lib/analytics/dateRange'
import { returnsSummary } from '@/lib/analytics/returns'
import { customerMix } from '@/lib/analytics/customerMix'
import { deliverySpeed, lateOrders } from '@/lib/analytics/deliverySpeed'
import { DashboardCharts } from './DashboardCharts'
import { InsightCharts } from './InsightCharts'
import { KpiTiles } from './KpiTiles'
import { DashboardTopBar } from './DashboardTopBar'

export const dynamic = 'force-dynamic'

type ParsedItem = { name: string; color: string | null; variant: string | null; qty: number; lineTotal: number }
type OrderRow = {
  id: string
  blanxer_order_number: string | null
  customer_id: string | null
  delivered_at: string | null
  total: number | null
  delivery_charge: number | null
  status: string
  created_at: string
  parsed_items: ParsedItem[] | null
}
type ExpenseRow = { amount: number; expense_date: string; category: { name: string } | null }

function currentTime(): Date {
  return new Date()
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireUser()
  const { from, to } = await searchParams
  const supabase = createServiceClient()
  const bankBalance = await getBankBalance()

  const allOrders = await fetchAllRows<OrderRow>(
    supabase,
    'orders',
    'id, blanxer_order_number, customer_id, delivered_at, total, delivery_charge, status:blanxer_status, created_at, parsed_items',
    'created_at'
  )
  const allExpenses = await fetchAllRows<ExpenseRow>(
    supabase,
    'expenses',
    'id, amount, expense_date, category:expense_categories(name)',
    'expense_date'
  )

  const safeOrders = allOrders.filter((o) => isWithinRange(o.created_at, from, to))
  const safeExpenses = allExpenses.filter((e) => isWithinRange(e.expense_date, from, to))

  const monthly = monthlySummary(
    // Delivery charge is money collected on the customer's behalf for the
    // courier, not revenue this store earned — Blanxer's own dashboard
    // excludes it, so revenue here is order total net of that charge.
    safeOrders.map((o) => ({
      total: (o.total ?? 0) - (o.delivery_charge ?? 0),
      status: o.status,
      createdAt: o.created_at,
      parsedItems: o.parsed_items ?? [],
    })),
    safeExpenses.map((e) => ({ amount: e.amount, expenseDate: e.expense_date }))
  )
  const products = productPerformance(
    safeOrders.map((o) => ({ status: o.status, parsedItems: o.parsed_items ?? [] }))
  )
  const deviceModels = deviceModelPerformance(
    safeOrders.map((o) => ({ status: o.status, parsedItems: o.parsed_items ?? [] }))
  ).slice(0, 10)
  const colors = colorPerformance(
    safeOrders.map((o) => ({ status: o.status, parsedItems: o.parsed_items ?? [] }))
  )
  const breakdown = expenseBreakdown(
    safeExpenses.map((e) => ({ categoryName: e.category?.name ?? 'Uncategorized', amount: e.amount }))
  )

  // Per-model breakdown for the small set of top device models, so clicking
  // a bar on that chart can show which products and colors it's made of
  // without a round trip — computed only for the top 10, not every model,
  // since that's all the chart ever shows.
  const productsByModel: Record<string, ProductPerformance[]> = {}
  const colorsByModel: Record<string, ColorPerformance[]> = {}
  for (const deviceModel of deviceModels) {
    const key = normalizeKey(deviceModel.model)
    const ordersForModel = safeOrders.map((o) => ({
      status: o.status,
      parsedItems: (o.parsed_items ?? []).filter((item) => normalizeKey(extractModel(item.variant) ?? '') === key),
    }))
    productsByModel[deviceModel.model] = productPerformance(ordersForModel)
    colorsByModel[deviceModel.model] = colorPerformance(ordersForModel)
  }

  const toDeliveryRow = (o: OrderRow) => ({
    id: o.id,
    orderNumber: o.blanxer_order_number,
    status: o.status,
    createdAt: o.created_at,
    deliveredAt: o.delivered_at,
  })
  const returns = returnsSummary(
    safeOrders.map((o) => ({ status: o.status, createdAt: o.created_at, parsedItems: o.parsed_items ?? [] }))
  )
  const customers = customerMix(
    allOrders.map((o) => ({ status: o.status, createdAt: o.created_at, customerId: o.customer_id })),
    (o) => isWithinRange(o.createdAt, from, to)
  )
  const delivery = deliverySpeed(safeOrders.map(toDeliveryRow))
  // Late orders are about right now, so the date filter doesn't apply to them.
  const late = lateOrders(allOrders.map(toDeliveryRow), currentTime())

  return (
    <div className="page space-y-6">
      <h1 className="text-2xl font-bold text-ink">Data</h1>
      <DashboardTopBar from={from} to={to} bankBalance={bankBalance} />
      <KpiTiles monthly={monthly} hasFilter={Boolean(from || to)} />
      <DashboardCharts
        monthly={monthly}
        products={products}
        deviceModels={deviceModels}
        colors={colors}
        breakdown={breakdown}
        productsByModel={productsByModel}
        colorsByModel={colorsByModel}
      />
      <InsightCharts returns={returns} customers={customers} delivery={delivery} late={late} />
    </div>
  )
}
