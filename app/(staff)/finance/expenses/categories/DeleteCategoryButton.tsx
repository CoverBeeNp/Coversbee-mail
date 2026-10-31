'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteExpenseCategory } from '@/lib/expenses/categories'

export function DeleteCategoryButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await deleteExpenseCategory(id)
      router.refresh()
    } catch (err) {
      // A category still referenced by expenses can't be deleted; show the
      // mapped message instead of crashing the page.
      setError(err instanceof Error ? err.message : 'Could not delete this category')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" className="btn-outline" disabled={pending}>Delete</button>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </form>
  )
}
