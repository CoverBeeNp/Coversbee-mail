'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const supabase = createBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) { setError(error.message); return }
    // The nav bar's <Link href="/overview"> is prefetched while still logged
    // out, so router.push alone can reuse that stale unauthenticated
    // prefetch (only reproduces in a production build — next dev doesn't
    // cache RSC payloads the same way). router.refresh() forces a fresh
    // fetch of the destination so it reflects the just-created session,
    // mirroring the same push+refresh pairing nav-actions.tsx's log-out
    // already uses.
    router.push('/overview')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="CoversBee" width={56} height={54} />
          <div>
            <h1 className="text-xl font-bold text-ink">CoversBee Mail</h1>
            <p className="text-sm text-muted">Staff sign in</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label htmlFor="email" className="field-label">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-input"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p role="alert" className="alert-error">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-gold w-full">
            {submitting ? 'Signing in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
