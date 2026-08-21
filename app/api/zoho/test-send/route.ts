import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, ZohoAuthError, ZohoSendError } from '@/lib/zoho/client'

export async function POST(request: NextRequest) {
  const { to } = await request.json()
  const supabase = createServiceClient()
  try {
    const result = await sendEmail(supabase, { to, subject: 'CoversBee Mail test', htmlBody: '<p>This is a test email from CoversBee Mail.</p>' })
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    const status = err instanceof ZohoAuthError ? 401 : err instanceof ZohoSendError ? 502 : 500
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status })
  }
}
