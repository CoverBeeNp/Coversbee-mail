'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'

export type ExpenseCategory = { id: string; name: string }

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('expense_categories').select('id, name').order('name')
  if (error) throw error
  return data
}

// Postgres error codes surfaced by the Supabase client.
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

type PostgresError = { code?: string; message?: string }

function isPgError(error: PostgresError, code: string, messageNeedle: string): boolean {
  if (error.code === code) return true
  // Older/edge client responses can omit `code`; fall back to the message text.
  return !error.code && (error.message ?? '').toLowerCase().includes(messageNeedle)
}

export async function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('expense_categories').insert({ name }).select('id, name').single()
  if (error) {
    if (isPgError(error, UNIQUE_VIOLATION, 'duplicate key')) {
      throw new Error('A category with this name already exists')
    }
    throw error
  }
  return data
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  await requireUser()
  const supabase = createServiceClient()
  const { error } = await supabase.from('expense_categories').delete().eq('id', id)
  if (error) {
    if (isPgError(error, FOREIGN_KEY_VIOLATION, 'foreign key')) {
      throw new Error('Cannot delete — this category has expenses')
    }
    throw error
  }
}
