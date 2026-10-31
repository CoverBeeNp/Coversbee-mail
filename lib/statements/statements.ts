'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'
import { fetchAllRows } from '@/lib/supabase/fetchAllRows'
import { monthlySummary } from '@/lib/analytics/monthly'
import { profitMarginPercent } from '@/lib/analytics/margin'
import { productPerformance, type ProductPerformance } from '@/lib/analytics/products'
import { colorPerformance, type ColorPerformance } from '@/lib/analytics/colorPerformance'
import { deviceModelPerformance, type DeviceModelPerformance } from '@/lib/analytics/deviceModels'
import { expenseBreakdown, type ExpenseBreakdownRow } from '@/lib/analytics/expenseBreakdown'
import { previousMonthKey } from './monthKey'

export type StatementSummary = {
  month: string
  revenue: number
  expenses: number
  profit: number
  marginPercent: number
  generatedAt: string
}

export type MonthlyStatement = StatementSummary & {
  prevMonthRevenue: number | null
  prevMonthProfit: number | null
  openingBalance: number | null
  closingBalance: number
  balanceAsOf: string
  returnAmount: number
  categoryBreakdown: ExpenseBreakdownRow[]
  topProducts: ProductPerformance[]
  topColors: ColorPerformance[]
  topDeviceModels: DeviceModelPerformance[]
}

export type GenerateStatementInput = {
  openingBalance: number
  closingBalance: number
  returnAmount: number
}

type StatementRow = {
  month: string
  revenue: number
  expenses: number
  profit: number
  margin_percent: number
  prev_month_revenue: number | null
  prev_month_profit: number | null
  opening_balance: number | null
  closing_balance: number
  balance_as_of: string
  return_amount: number
  category_breakdown: ExpenseBreakdownRow[]
  top_products: ProductPerformance[]
  top_colors: ColorPerformance[]
  top_device_models: DeviceModelPerformance[]
  generated_at: string
}

function fromRow(row: StatementRow): MonthlyStatement {
  return {
    month: row.month,
    revenue: row.revenue,
    expenses: row.expenses,
    profit: row.profit,
    marginPercent: row.margin_percent,
    prevMonthRevenue: row.prev_month_revenue,
    prevMonthProfit: row.prev_month_profit,
    openingBalance: row.opening_balance,
    closingBalance: row.closing_balance,
    balanceAsOf: row.balance_as_of,
    returnAmount: row.return_amount,
    categoryBreakdown: row.category_breakdown,
    topProducts: row.top_products,
    topColors: row.top_colors,
    topDeviceModels: row.top_device_models,
    generatedAt: row.generated_at,
  }
}

const SUMMARY_COLUMNS = 'month, revenue, expenses, profit, margin_percent, generated_at'
const FULL_COLUMNS =
  'month, revenue, expenses, profit, margin_percent, prev_month_revenue, prev_month_profit, opening_balance, closing_balance, balance_as_of, return_amount, category_breakdown, top_products, top_colors, top_device_models, generated_at'

export async function listStatements(): Promise<StatementSummary[]> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('monthly_statements').select(SUMMARY_COLUMNS).order('month', { ascending: false })
  if (error) throw error
  return (data as unknown as StatementRow[]).map((row) => ({
    month: row.month,
    revenue: row.revenue,
    expenses: row.expenses,
    profit: row.profit,
    marginPercent: row.margin_percent,
    generatedAt: row.generated_at,
  }))
}

export async function getStatement(month: string): Promise<MonthlyStatement | null> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('monthly_statements').select(FULL_COLUMNS).eq('month', month).maybeSingle()
  if (error) throw error
  return data ? fromRow(data as unknown as StatementRow) : null
}

export async function deleteStatement(month: string): Promise<void> {
  await requireUser()
  const supabase = createServiceClient()
  const { error } = await supabase.from('monthly_statements').delete().eq('month', month)
  if (error) throw error
}

type OrderRow = {
  status: string
  total: number | null
  delivery_charge: number | null
  created_at: string
  parsed_items: { name: string; color: string | null; variant: string | null; qty: number; lineTotal: number }[] | null
}
type ExpenseRow = { amount: number; expense_date: string; category: { name: string } | null }

export async function generateStatement(month: string, input: GenerateStatementInput): Promise<MonthlyStatement> {
  await requireUser()
  const supabase = createServiceClient()

  const { data: existing, error: existingError } = await supabase
    .from('monthly_statements')
    .select('id')
    .eq('month', month)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) throw new Error(`A statement for ${month} already exists`)

  const [allOrders, allExpenses] = await Promise.all([
    fetchAllRows<OrderRow>(supabase, 'orders', 'status:blanxer_status, total, delivery_charge, created_at, parsed_items', 'created_at'),
    fetchAllRows<ExpenseRow>(supabase, 'expenses', 'amount, expense_date, category:expense_categories(name)', 'expense_date'),
  ])

  const monthly = monthlySummary(
    // Delivery charge is money collected on the customer's behalf for the
    // courier, not revenue this store earned — Blanxer's own dashboard
    // excludes it, so revenue here is order total net of that charge.
    allOrders.map((o) => ({
      total: (o.total ?? 0) - (o.delivery_charge ?? 0),
      status: o.status,
      createdAt: o.created_at,
      parsedItems: o.parsed_items ?? [],
    })),
    allExpenses.map((e) => ({ amount: e.amount, expenseDate: e.expense_date }))
  )
  const current = monthly.find((m) => m.month === month)
  if (!current && input.returnAmount <= 0) {
    throw new Error(`No orders or expenses recorded for ${month} — nothing to summarize`)
  }
  const revenue = current?.revenue ?? 0
  // Offer/return amounts aren't logged as regular expenses, so staff can
  // fold one in by hand at generation time — it's added on top of whatever
  // the expenses table already recorded for the month.
  const expenses = (current?.expenses ?? 0) + input.returnAmount
  const profit = revenue - expenses

  const previous = monthly.find((m) => m.month === previousMonthKey(month))

  const monthOrders = allOrders
    .filter((o) => o.created_at.slice(0, 7) === month)
    .map((o) => ({ status: o.status, parsedItems: o.parsed_items ?? [] }))
  const monthExpenses = allExpenses.filter((e) => e.expense_date.slice(0, 7) === month)

  const marginPercent = profitMarginPercent(revenue, profit)
  const categoryBreakdown = expenseBreakdown(
    monthExpenses.map((e) => ({ categoryName: e.category?.name ?? 'Uncategorized', amount: e.amount }))
  )
  if (input.returnAmount > 0) {
    categoryBreakdown.push({ categoryName: 'Offer/return adjustment', total: input.returnAmount })
    categoryBreakdown.sort((a, b) => b.total - a.total)
  }
  const topProducts = productPerformance(monthOrders).slice(0, 5)
  const topColors = colorPerformance(monthOrders).slice(0, 5)
  const topDeviceModels = deviceModelPerformance(monthOrders).slice(0, 5)

  const { data: inserted, error: insertError } = await supabase
    .from('monthly_statements')
    .insert({
      month,
      revenue,
      expenses,
      profit,
      margin_percent: marginPercent,
      prev_month_revenue: previous?.revenue ?? null,
      prev_month_profit: previous?.profit ?? null,
      opening_balance: input.openingBalance,
      closing_balance: input.closingBalance,
      balance_as_of: new Date().toISOString(),
      return_amount: input.returnAmount,
      category_breakdown: categoryBreakdown,
      top_products: topProducts,
      top_colors: topColors,
      top_device_models: topDeviceModels,
    })
    .select(FULL_COLUMNS)
    .single()
  if (insertError) throw insertError

  return fromRow(inserted as unknown as StatementRow)
}
