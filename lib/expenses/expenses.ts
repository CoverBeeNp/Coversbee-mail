'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'

export type Expense = {
  id: string
  categoryId: string
  amount: number
  expenseDate: string
  note: string | null
  paidTo: string | null
  paidBy: string | null
  amountUsd: number | null
}
export type ExpenseInput = {
  categoryId: string
  amount: number
  expenseDate: string
  note: string | null
  paidTo: string | null
  paidBy: string | null
  amountUsd: number | null
}

type ExpenseRow = {
  id: string
  category_id: string
  amount: number
  expense_date: string
  note: string | null
  paid_to: string | null
  paid_by: string | null
  amount_usd: number | null
}

function fromRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    categoryId: row.category_id,
    amount: row.amount,
    expenseDate: row.expense_date,
    note: row.note,
    paidTo: row.paid_to,
    paidBy: row.paid_by,
    amountUsd: row.amount_usd,
  }
}

function toRow(input: ExpenseInput) {
  return {
    category_id: input.categoryId,
    amount: input.amount,
    expense_date: input.expenseDate,
    note: input.note,
    paid_to: input.paidTo,
    paid_by: input.paidBy,
    amount_usd: input.amountUsd,
  }
}

const SELECT_COLUMNS = 'id, category_id, amount, expense_date, note, paid_to, paid_by, amount_usd'

export async function listExpenses(): Promise<Expense[]> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('expenses').select(SELECT_COLUMNS).order('expense_date', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('expenses').insert(toRow(input)).select(SELECT_COLUMNS).single()
  if (error) throw error
  return fromRow(data)
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('expenses').update(toRow(input)).eq('id', id).select(SELECT_COLUMNS).single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteExpense(id: string): Promise<void> {
  await requireUser()
  const supabase = createServiceClient()
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
