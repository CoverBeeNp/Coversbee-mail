import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { syncFromBlanxer } from '@/lib/blanxer/sync'

export const maxDuration = 60

// Stops before the function limit. Anything unfinished is picked up next time.
const TIME_BUDGET_MS = 45_000

// Sync never sends email. See lib/blanxer/sync.ts.
export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.BLANXER_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'BLANXER_API_KEY is not configured' }, { status: 500 })

  try {
    const result = await syncFromBlanxer(createServiceClient(), apiKey, {
      now: new Date(),
      deadline: Date.now() + TIME_BUDGET_MS,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 })
  }
}
