'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'

export async function getBankBalance(): Promise<number> {
  await requireUser()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('bank_balance').select('amount').eq('id', true).single()
  if (error) throw error
  return data.amount
}

export async function setBankBalance(amount: number): Promise<void> {
  await requireUser()
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('bank_balance')
    .update({ amount, updated_at: new Date().toISOString() })
    .eq('id', true)
  if (error) throw error
}
