// One-time copy of the Finance project's data into this project.
//
//   node --env-file=.env.copy scripts/copy-finance-data.ts            dry run
//   node --env-file=.env.copy scripts/copy-finance-data.ts --apply    copy, then verify
//
// Add --finance-tables to copy only categories, expenses, statements and the
// bank balance. Add --keep-mail-items to leave parsed_items alone on orders
// already in Mail: an older deployed app shows `variant` alone, so splitting
// colour out would drop it from customer emails until the new version is live.
//
// .env.copy needs SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY (Finance) and
// TARGET_SUPABASE_URL, TARGET_SERVICE_ROLE_KEY (this project). The dry run only
// reads, and works before migration 0010 is applied, so it doubles as the
// duplicate audit. --apply needs 0010.
//
// Orders were copied on 2026-10-31 and Blanxer is now their source of truth.
// Finance's stored order statuses are out of date, so applying its orders again
// would undo sync's work. --apply now needs --finance-tables, unless
// --include-orders is passed deliberately.
//
// supabase-js has no transactions, so this is written to be safe to re-run:
// rows keep their ids, matches are recomputed, and nothing is deleted. Output
// is counts and order numbers only, never customer details.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { fetchAllRows } from '../lib/supabase/fetchAllRows.ts'
import { isRevenueOrder } from '../lib/analytics/orderFilters.ts'

type Row = Record<string, unknown>
export type Customer = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  blanxer_customer_id?: string | null
  subscribed_to_marketing?: boolean
  created_at?: string
}
export type SourceOrder = {
  id: string
  blanxer_id: string | null
  order_number: string
  customer_id: string | null
  status: string
  subtotal: number | null
  delivery_charge: number | null
  total: number | null
  parsed_items: unknown
  source: string
  created_at: string
}
export type TargetOrder = {
  id: string
  blanxer_id: string | null
  blanxer_order_number: string | null
  customer_id: string | null
}

// Blanxer and hand-entered numbers can differ by prefix or spacing, so compare
// the last ten digits.
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-10) : null
}

export function normalizeEmail(email: string | null | undefined): string | null {
  return email?.trim().toLowerCase() || null
}

export type CustomerPlan = {
  inserts: Customer[]
  patches: Map<string, Partial<Customer>>
  idMap: Map<string, string>
  mergedSourceRows: number
}

// Existing customers keep their ids, because unsubscribe links contain them,
// and keep their subscription. Customers new to this project start unsubscribed.
export function planCustomers(source: Customer[], target: Customer[]): CustomerPlan {
  const plan: CustomerPlan = { inserts: [], patches: new Map(), idMap: new Map(), mergedSourceRows: 0 }
  const existingIds = new Set(target.map((c) => c.id))
  const byId = new Map<string, Customer>()
  const byBlanxerId = new Map<string, Customer>()
  const byPhone = new Map<string, Customer>()
  const byEmail = new Map<string, Customer>()

  const index = (c: Customer) => {
    byId.set(c.id, c)
    const phone = normalizePhone(c.phone)
    const email = normalizeEmail(c.email)
    if (c.blanxer_customer_id && !byBlanxerId.has(c.blanxer_customer_id)) byBlanxerId.set(c.blanxer_customer_id, c)
    if (phone && !byPhone.has(phone)) byPhone.set(phone, c)
    if (email && !byEmail.has(email)) byEmail.set(email, c)
  }
  // Copies, so filling gaps below is visible to later matches without
  // changing the caller's rows.
  for (const c of target) index({ ...c })

  for (const s of source) {
    const phone = normalizePhone(s.phone)
    const email = normalizeEmail(s.email)
    const match =
      byId.get(s.id) ??
      (s.blanxer_customer_id ? byBlanxerId.get(s.blanxer_customer_id) : undefined) ??
      (phone ? byPhone.get(phone) : undefined) ??
      (email ? byEmail.get(email) : undefined)

    if (!match) {
      const row: Customer = {
        id: s.id,
        blanxer_customer_id: s.blanxer_customer_id ?? null,
        name: s.name ?? 'Unknown',
        phone: s.phone,
        email: s.email,
        subscribed_to_marketing: false,
        created_at: s.created_at,
      }
      plan.inserts.push(row)
      plan.idMap.set(s.id, s.id)
      index(row)
      continue
    }

    plan.idMap.set(s.id, match.id)
    if (match.id !== s.id) plan.mergedSourceRows++

    const fill: Partial<Customer> = {}
    if (s.blanxer_customer_id && !match.blanxer_customer_id) fill.blanxer_customer_id = s.blanxer_customer_id
    if (s.email && !match.email) fill.email = s.email
    if (s.phone && !match.phone) fill.phone = s.phone
    if (s.name && s.name !== 'Unknown' && (!match.name || match.name === 'Unknown')) fill.name = s.name
    if (Object.keys(fill).length === 0) continue

    Object.assign(match, fill)
    index(match)
    if (existingIds.has(match.id)) {
      plan.patches.set(match.id, { ...plan.patches.get(match.id), ...fill })
    } else {
      Object.assign(plan.inserts.find((row) => row.id === match.id)!, fill)
    }
  }
  return plan
}

export type OrderPlan = {
  inserts: Row[]
  patches: Map<string, Row>
  conflicts: { orderNumber: string; reason: string }[]
  mailOnlyOrders: number
}

// A matched order takes Finance's real date, totals, items and Blanxer status,
// and keeps its email status, address and tracking link. An order only in
// Finance gets a null status, which keeps it out of the email workflow.
export function planOrders(
  source: SourceOrder[],
  target: TargetOrder[],
  customerIds: Map<string, string>,
  options: { keepMailItems?: boolean } = {}
): OrderPlan {
  const plan: OrderPlan = { inserts: [], patches: new Map(), conflicts: [], mailOnlyOrders: 0 }
  const byId = new Map(target.map((o) => [o.id, o]))
  const byBlanxerId = new Map(target.filter((o) => o.blanxer_id).map((o) => [o.blanxer_id!, o]))
  const byNumber = new Map(target.filter((o) => o.blanxer_order_number).map((o) => [o.blanxer_order_number!, o]))
  const seenNumbers = new Set<string>()
  const matched = new Set<string>()

  for (const s of source) {
    if (seenNumbers.has(s.order_number)) {
      plan.conflicts.push({ orderNumber: s.order_number, reason: 'repeated in Finance' })
      continue
    }
    seenNumbers.add(s.order_number)

    const numberMatch = byNumber.get(s.order_number)
    const direct = byId.get(s.id) ?? (s.blanxer_id ? byBlanxerId.get(s.blanxer_id) : undefined)
    if (!direct && numberMatch?.blanxer_id) {
      plan.conflicts.push({ orderNumber: s.order_number, reason: 'number belongs to a different Blanxer order in Mail' })
      continue
    }
    if (direct && numberMatch && numberMatch.id !== direct.id) {
      plan.conflicts.push({ orderNumber: s.order_number, reason: 'matches two different orders in Mail' })
      continue
    }

    const fields = {
      blanxer_id: s.blanxer_id,
      blanxer_order_number: s.order_number,
      blanxer_status: s.status,
      subtotal: s.subtotal,
      delivery_charge: s.delivery_charge,
      total: s.total,
      parsed_items: s.parsed_items,
      source: s.source,
      created_at: s.created_at,
    }
    const customerId = s.customer_id ? customerIds.get(s.customer_id) ?? null : null

    const match = direct ?? numberMatch
    if (match) {
      matched.add(match.id)
      const { parsed_items, ...otherFields } = fields
      plan.patches.set(match.id, {
        ...otherFields,
        ...(options.keepMailItems ? {} : { parsed_items }),
        ...(match.customer_id ? {} : { customer_id: customerId }),
      })
    } else {
      plan.inserts.push({ ...fields, id: s.id, customer_id: customerId, status: null, status_updated_at: s.created_at })
    }
  }
  plan.mailOnlyOrders = target.filter((o) => !matched.has(o.id)).length
  return plan
}

export function revenueByMonth(
  orders: { status: string | null; total: number | null; delivery_charge: number | null; created_at: string }[]
): Map<string, number> {
  const months = new Map<string, number>()
  for (const o of orders) {
    if (!isRevenueOrder(o.status as string)) continue
    const month = o.created_at.slice(0, 7)
    months.set(month, (months.get(month) ?? 0) + (o.total ?? 0) - (o.delivery_charge ?? 0))
  }
  return months
}

export function revenueDifferences(source: Map<string, number>, target: Map<string, number>) {
  const differences: { month: string; source: number; target: number }[] = []
  for (const month of new Set([...source.keys(), ...target.keys()])) {
    const a = source.get(month) ?? 0
    const b = target.get(month) ?? 0
    if (Math.abs(a - b) >= 0.01) differences.push({ month, source: a, target: b })
  }
  return differences.sort((x, y) => x.month.localeCompare(y.month))
}

// Column order differs between the projects, so compare by key.
export function statementsMatch(source: Row[], target: Row[]): string[] {
  const canonical = (row: Row) => JSON.stringify(Object.keys(row).sort().map((key) => [key, row[key]]))
  const byId = new Map(target.map((row) => [row.id, canonical(row)]))
  return source.filter((row) => byId.get(row.id) !== canonical(row)).map((row) => String(row.month))
}

function repeated(values: (string | null)[]): number {
  const counts = new Map<string, number>()
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.values()].filter((count) => count > 1).length
}

async function upsertInChunks(client: SupabaseClient, table: string, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

async function applyPatches(client: SupabaseClient, table: string, patches: Map<string, Row>) {
  for (const [id, values] of patches) {
    const { error } = await client.from(table).update(values).eq('id', id)
    if (error) throw new Error(`${table} ${id}: ${error.message}`)
  }
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

async function main() {
  const apply = process.argv.includes('--apply')
  const financeTablesOnly = process.argv.includes('--finance-tables')
  const keepMailItems = process.argv.includes('--keep-mail-items')
  if (apply && !financeTablesOnly && !process.argv.includes('--include-orders')) {
    throw new Error('Orders are already copied and now follow Blanxer. Use --finance-tables.')
  }
  const sourceUrl = env('SOURCE_SUPABASE_URL')
  const targetUrl = env('TARGET_SUPABASE_URL')
  if (sourceUrl === targetUrl) throw new Error('Source and target are the same project')

  const options = { auth: { persistSession: false } }
  const source = createClient(sourceUrl, env('SOURCE_SERVICE_ROLE_KEY'), options)
  const target = createClient(targetUrl, env('TARGET_SERVICE_ROLE_KEY'), options)

  const sourceCustomers = await fetchAllRows<Customer>(source, 'customers', '*', 'created_at')
  const sourceOrders = await fetchAllRows<SourceOrder>(source, 'orders', '*', 'created_at')
  const targetCustomers = await fetchAllRows<Customer>(target, 'customers', '*', 'created_at')
  const targetOrders = await fetchAllRows<TargetOrder>(target, 'orders', '*', 'created_at')

  const customers = planCustomers(sourceCustomers, targetCustomers)
  const orders = planOrders(sourceOrders, targetOrders, customers.idMap, { keepMailItems })

  console.log(JSON.stringify({
    finance: {
      customers: sourceCustomers.length,
      orders: sourceOrders.length,
      sharedPhones: repeated(sourceCustomers.map((c) => normalizePhone(c.phone))),
      sharedEmails: repeated(sourceCustomers.map((c) => normalizeEmail(c.email))),
      repeatedOrderNumbers: repeated(sourceOrders.map((o) => o.order_number)),
    },
    mail: {
      customers: targetCustomers.length,
      orders: targetOrders.length,
      unsubscribed: targetCustomers.filter((c) => c.subscribed_to_marketing === false).length,
      sharedPhones: repeated(targetCustomers.map((c) => normalizePhone(c.phone))),
      sharedEmails: repeated(targetCustomers.map((c) => normalizeEmail(c.email))),
      repeatedOrderNumbers: repeated(targetOrders.map((o) => o.blanxer_order_number)),
    },
    plan: {
      customersToAddAsUnsubscribed: customers.inserts.length,
      customersToFillIn: customers.patches.size,
      financeCustomersMergedIntoAnother: customers.mergedSourceRows,
      ordersToAddOutsideEmailWorkflow: orders.inserts.length,
      ordersToUpdate: orders.patches.size,
      ordersOnlyInMail: orders.mailOnlyOrders,
    },
    conflicts: orders.conflicts,
  }, null, 2))

  if (orders.conflicts.length > 0) {
    console.error(`Stopped: ${orders.conflicts.length} order conflict(s) must be resolved first. Nothing was written.`)
    process.exitCode = 1
    return
  }
  if (!apply) {
    console.log('Dry run: nothing was written. Pass --apply to copy.')
    return
  }

  if (!financeTablesOnly) {
    await upsertInChunks(target, 'customers', customers.inserts)
    await applyPatches(target, 'customers', customers.patches)
    await upsertInChunks(target, 'orders', orders.inserts)
    await applyPatches(target, 'orders', orders.patches)
  }

  const categories = await fetchAllRows<Row>(source, 'expense_categories', '*', 'created_at')
  const expenses = await fetchAllRows<Row>(source, 'expenses', '*', 'created_at')
  const statements = await fetchAllRows<Row>(source, 'monthly_statements', '*', 'month')
  await upsertInChunks(target, 'expense_categories', categories)
  await upsertInChunks(target, 'expenses', expenses)
  await upsertInChunks(target, 'monthly_statements', statements)

  const { data: balance, error: balanceError } = await source.from('bank_balance').select('amount, updated_at').eq('id', true).single()
  if (balanceError) throw new Error(`bank_balance: ${balanceError.message}`)
  const { error: balanceWriteError } = await target.from('bank_balance').update(balance).eq('id', true)
  if (balanceWriteError) throw new Error(`bank_balance: ${balanceWriteError.message}`)

  const problems: string[] = []
  const afterCustomers = await fetchAllRows<Customer>(target, 'customers', '*', 'created_at')
  const afterOrders = await fetchAllRows<Row>(target, 'orders', 'id, status, blanxer_status, total, delivery_charge, created_at', 'created_at')
  const afterExpenses = await fetchAllRows<Row>(target, 'expenses', 'id', 'created_at')
  const afterStatements = await fetchAllRows<Row>(target, 'monthly_statements', '*', 'month')

  const wasUnsubscribed = targetCustomers.filter((c) => c.subscribed_to_marketing === false).map((c) => c.id)
  const stillUnsubscribed = new Set(afterCustomers.filter((c) => c.subscribed_to_marketing === false).map((c) => c.id))
  const resubscribed = wasUnsubscribed.filter((id) => !stillUnsubscribed.has(id))
  if (resubscribed.length > 0) problems.push(`${resubscribed.length} unsubscribed customer(s) are now subscribed`)

  const expectedOrders = targetOrders.length + (financeTablesOnly ? 0 : orders.inserts.length)
  if (afterOrders.length !== expectedOrders) problems.push(`orders: expected ${expectedOrders}, found ${afterOrders.length}`)
  if (afterExpenses.length !== expenses.length) problems.push(`expenses: expected ${expenses.length}, found ${afterExpenses.length}`)
  const statementMismatches = statementsMatch(statements, afterStatements)
  if (statementMismatches.length > 0) problems.push(`statements differ for: ${statementMismatches.join(', ')}`)

  if (!financeTablesOnly) {
    const differences = revenueDifferences(
      revenueByMonth(sourceOrders),
      revenueByMonth(afterOrders.map((o) => ({ ...o, status: o.blanxer_status })) as never)
    )
    console.log(JSON.stringify({ revenueDifferencesByMonth: differences }, null, 2))
    if (differences.length > 0 && orders.mailOnlyOrders === 0) problems.push('revenue differs from Finance')
  }

  if (problems.length > 0) {
    console.error(`Verification FAILED:\n- ${problems.join('\n- ')}`)
    process.exitCode = 1
    return
  }
  console.log('Copy complete and verified.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error((err as Error).message)
    process.exitCode = 1
  })
}
