import { describe, it, expect, vi } from 'vitest'

const listRow = {
  id: 'e1',
  category_id: 'c1',
  amount: 500,
  expense_date: '2026-09-01',
  note: 'Office rent',
  paid_to: 'Landlord Co',
  paid_by: 'Yamash',
  amount_usd: null,
}
const order = vi.fn().mockResolvedValue({ data: [listRow], error: null })
const select = vi.fn(() => ({ order }))

const insertSelectSingle = vi.fn().mockResolvedValue({ data: listRow, error: null })
const insertSelect = vi.fn(() => ({ single: insertSelectSingle }))
const insert = vi.fn(() => ({ select: insertSelect }))

const updateSelectSingle = vi.fn().mockResolvedValue({ data: listRow, error: null })
const updateSelect = vi.fn(() => ({ single: updateSelectSingle }))
const updateEq = vi.fn(() => ({ select: updateSelect }))
const update = vi.fn(() => ({ eq: updateEq }))

const deleteEq = vi.fn().mockResolvedValue({ error: null })
const del = vi.fn(() => ({ eq: deleteEq }))

const from = vi.fn(() => ({ select, insert, update, delete: del }))

vi.mock('@/lib/auth/requireUser', () => ({ requireUser: async () => ({ id: 'staff-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from }),
}))

import { listExpenses, createExpense, updateExpense, deleteExpense } from './expenses'

const fullExpense = {
  id: 'e1',
  categoryId: 'c1',
  amount: 500,
  expenseDate: '2026-09-01',
  note: 'Office rent',
  paidTo: 'Landlord Co',
  paidBy: 'Yamash',
  amountUsd: null,
}

describe('expenses', () => {
  it('lists expenses ordered by date, newest first', async () => {
    const result = await listExpenses()
    expect(result).toEqual([fullExpense])
    expect(order).toHaveBeenCalledWith('expense_date', { ascending: false })
  })

  it('creates an expense including payment details', async () => {
    const result = await createExpense({
      categoryId: 'c1',
      amount: 500,
      expenseDate: '2026-09-01',
      note: 'Office rent',
      paidTo: 'Landlord Co',
      paidBy: 'Yamash',
      amountUsd: null,
    })
    expect(insert).toHaveBeenCalledWith({
      category_id: 'c1',
      amount: 500,
      expense_date: '2026-09-01',
      note: 'Office rent',
      paid_to: 'Landlord Co',
      paid_by: 'Yamash',
      amount_usd: null,
    })
    expect(result.id).toBe('e1')
  })

  it('updates an expense including payment details', async () => {
    await updateExpense('e1', {
      categoryId: 'c1',
      amount: 600,
      expenseDate: '2026-09-02',
      note: null,
      paidTo: 'New Vendor',
      paidBy: 'Upendra',
      amountUsd: 4.5,
    })
    expect(update).toHaveBeenCalledWith({
      category_id: 'c1',
      amount: 600,
      expense_date: '2026-09-02',
      note: null,
      paid_to: 'New Vendor',
      paid_by: 'Upendra',
      amount_usd: 4.5,
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'e1')
  })

  it('deletes an expense', async () => {
    await deleteExpense('e1')
    expect(deleteEq).toHaveBeenCalledWith('id', 'e1')
  })
})
