'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpense, updateExpense, type Expense, type ExpenseInput } from '@/lib/expenses/expenses'
import type { ExpenseCategory } from '@/lib/expenses/categories'
import { useModalClose } from '../Modal'

export function ExpenseForm({
  categories,
  existing,
}: {
  categories: ExpenseCategory[]
  existing?: Expense
}) {
  const router = useRouter()
  const closeModal = useModalClose()
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [amountUsd, setAmountUsd] = useState(existing?.amountUsd != null ? String(existing.amountUsd) : '')
  const [expenseDate, setExpenseDate] = useState(existing?.expenseDate ?? new Date().toISOString().slice(0, 10))
  const [paidTo, setPaidTo] = useState(existing?.paidTo ?? '')
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const input: ExpenseInput = {
      categoryId,
      amount: Number(amount),
      expenseDate,
      note: note || null,
      paidTo: paidTo || null,
      paidBy: paidBy || null,
      amountUsd: amountUsd ? Number(amountUsd) : null,
    }
    if (existing) {
      await updateExpense(existing.id, input)
      router.push('/finance/expenses')
    } else {
      await createExpense(input)
      closeModal()
    }
    setPending(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className={existing ? 'card space-y-4' : 'space-y-4'}>
      <div>
        <label className="field-label" htmlFor="category">Category</label>
        <select id="category" className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="paidTo">Payment to</label>
        <input id="paidTo" type="text" className="field-input" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} required />
      </div>
      <div>
        <label className="field-label" htmlFor="paidBy">Payment by</label>
        <input id="paidBy" type="text" className="field-input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="amount">Amount (Rs)</label>
          <input id="amount" type="number" step="0.01" className="field-input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="field-label" htmlFor="amountUsd">Amount ($, optional)</label>
          <input id="amountUsd" type="number" step="0.01" className="field-input" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="expenseDate">Date</label>
        <input id="expenseDate" type="date" className="field-input" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
      </div>
      <div>
        <label className="field-label" htmlFor="note">Description</label>
        <input id="note" type="text" className="field-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary" disabled={pending || !categoryId}>
        {existing ? 'Save changes' : 'Add expense'}
      </button>
    </form>
  )
}
