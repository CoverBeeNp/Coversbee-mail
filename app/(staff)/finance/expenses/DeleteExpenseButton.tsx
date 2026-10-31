'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteExpense } from '@/lib/expenses/expenses'

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    await deleteExpense(id)
    router.refresh()
    setPending(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" className="btn-outline" disabled={pending}>Delete</button>
    </form>
  )
}
