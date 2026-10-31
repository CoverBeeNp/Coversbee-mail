'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExpenseCategory } from '@/lib/expenses/categories'

export function CategoryForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setPending(true)
    setError(null)
    try {
      await createExpenseCategory(name.trim())
      setName('')
      router.refresh()
    } catch (err) {
      // e.g. a duplicate category name hitting the unique constraint.
      setError(err instanceof Error ? err.message : 'Could not create this category')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <div className="flex gap-2">
        <input
          className="field-input"
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={pending}>Add</button>
      </div>
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </form>
  )
}
