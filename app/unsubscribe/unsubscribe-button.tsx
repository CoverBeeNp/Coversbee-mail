'use client'
import { useState } from 'react'

export function UnsubscribeButton({ customerId }: { customerId: string }) {
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  async function handleClick() {
    setState('submitting')
    const res = await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    })
    setState(res.ok ? 'done' : 'error')
  }

  if (state === 'done') {
    return <p className="mt-6 text-sm text-emerald-700">You&rsquo;ve been unsubscribed. Sorry to see you go!</p>
  }

  return (
    <div className="mt-6">
      <button onClick={handleClick} disabled={state === 'submitting'} className="btn-gold">
        {state === 'submitting' ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
      </button>
      {state === 'error' && (
        <p role="alert" className="alert-error mt-3">
          Something went wrong. Please try again or contact info@coversbee.com.np.
        </p>
      )}
    </div>
  )
}
