'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteManualOrder } from '@/lib/orders/manualOrders'

export function DeleteManualOrderButton({ id }: { id: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    await deleteManualOrder(id)
    router.refresh()
    setPending(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" className="btn-outline" disabled={pending}>Delete</button>
    </form>
  )
}
