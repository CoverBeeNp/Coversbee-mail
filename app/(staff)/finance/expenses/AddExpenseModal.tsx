'use client'

import { Modal } from '../Modal'
import { ExpenseForm } from './ExpenseForm'
import type { ExpenseCategory } from '@/lib/expenses/categories'

export function AddExpenseModal({ categories }: { categories: ExpenseCategory[] }) {
  return (
    <Modal triggerLabel="Add expense" triggerClassName="btn-danger-soft" title="Add an expense">
      <ExpenseForm categories={categories} />
    </Modal>
  )
}
