import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/requireStaff'
import { InstagramNotConnectedError, getInstagramAccount, syncInstagram } from '@/lib/instagram/sync'

export const maxDuration = 60

// Stops before the function limit. Anything unfinished is picked up next time.
const TIME_BUDGET_MS = 45_000
// The sidebar asks with `ifStale` every time it syncs Blanxer. Instagram
// figures change slowly, so that only syncs a few times a day.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const user = await requireStaff(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ifStale = request.nextUrl.searchParams.get('ifStale') === '1'
  const supabase = createServiceClient()
  const now = new Date()

  try {
    if (ifStale) {
      const account = await getInstagramAccount(supabase)
      if (!account) return NextResponse.json({ ok: true, skipped: 'not-connected' })
      if (account.last_synced_at && now.getTime() - Date.parse(account.last_synced_at) < STALE_AFTER_MS) {
        return NextResponse.json({ ok: true, skipped: 'fresh' })
      }
    }
    const result = await syncInstagram(supabase, { now, deadline: Date.now() + TIME_BUDGET_MS })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const status = err instanceof InstagramNotConnectedError ? 400 : 502
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}
