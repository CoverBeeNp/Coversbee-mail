import { describe, it, expect, vi } from 'vitest'

const order = vi.fn().mockResolvedValue({ data: [{ id: 'c1', name: 'Rent' }], error: null })
const select = vi.fn(() => ({ order }))
const insertSelectSingle = vi.fn().mockResolvedValue({ data: { id: 'c2', name: 'Ads' }, error: null })
const insertSelect = vi.fn(() => ({ single: insertSelectSingle }))
const insert = vi.fn(() => ({ select: insertSelect }))
const deleteEq = vi.fn().mockResolvedValue({ error: null })
const del = vi.fn(() => ({ eq: deleteEq }))
const from = vi.fn(() => ({ select, insert, delete: del }))

vi.mock('@/lib/auth/requireUser', () => ({ requireUser: async () => ({ id: 'staff-1' }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from }),
}))

import { listExpenseCategories, createExpenseCategory, deleteExpenseCategory } from './categories'

describe('expense categories', () => {
  it('lists categories ordered by name', async () => {
    const result = await listExpenseCategories()
    expect(result).toEqual([{ id: 'c1', name: 'Rent' }])
    expect(order).toHaveBeenCalledWith('name')
  })

  it('creates a category', async () => {
    const result = await createExpenseCategory('Ads')
    expect(result).toEqual({ id: 'c2', name: 'Ads' })
    expect(insert).toHaveBeenCalledWith({ name: 'Ads' })
  })

  it('deletes a category', async () => {
    await deleteExpenseCategory('c1')
    expect(deleteEq).toHaveBeenCalledWith('id', 'c1')
  })

  it('maps a unique violation on create to a readable message', async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    await expect(createExpenseCategory('Rent')).rejects.toThrow('A category with this name already exists')
  })

  it('maps a unique violation with no error code by matching the message', async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "expense_categories_name_key"' },
    })
    await expect(createExpenseCategory('Rent')).rejects.toThrow('A category with this name already exists')
  })

  it('maps a foreign-key violation on delete to a readable message', async () => {
    deleteEq.mockResolvedValueOnce({
      error: { code: '23503', message: 'update or delete on table violates foreign key constraint' },
    })
    await expect(deleteExpenseCategory('c1')).rejects.toThrow('Cannot delete — this category has expenses')
  })

  it('maps a foreign-key violation with no error code by matching the message', async () => {
    deleteEq.mockResolvedValueOnce({
      error: { message: 'violates foreign key constraint "expenses_category_id_fkey"' },
    })
    await expect(deleteExpenseCategory('c1')).rejects.toThrow('Cannot delete — this category has expenses')
  })

  it('rethrows an unrelated error untouched', async () => {
    deleteEq.mockResolvedValueOnce({ error: { code: '42501', message: 'permission denied' } })
    await expect(deleteExpenseCategory('c1')).rejects.toMatchObject({ message: 'permission denied' })
  })
})
