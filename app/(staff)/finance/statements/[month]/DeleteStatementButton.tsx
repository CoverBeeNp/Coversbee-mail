'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteStatement } from '@/lib/statements/statements'

export function DeleteStatementButton({ month }: { month: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick() {
    if (!confirm(`Delete the statement for ${month}? You can regenerate it afterwards from current data.`)) return
    setPending(true)
    await deleteStatement(month)
    router.push('/finance/statements')
    router.refresh()
  }

  return (
    <button type="button" className="btn-outline print:hidden" onClick={handleClick} disabled={pending}>
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
