import type { SupabaseClient } from '@supabase/supabase-js'

export class ZohoAuthError extends Error {}
export class ZohoSendError extends Error {}

export async function getAccessToken(supabase: SupabaseClient): Promise<string> {
  const { data: row } = await supabase.from('zoho_oauth_state').select('access_token, expires_at').single()

  if (row?.access_token && row.expires_at && new Date(row.expires_at) > new Date()) {
    return row.access_token
  }

  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
  const response = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: 'POST' })

  if (!response.ok) {
    await supabase.from('system_status').update({ zoho_connected: false, last_error: 'Zoho token refresh failed', updated_at: new Date().toISOString() }).eq('id', true)
    throw new ZohoAuthError('Zoho OAuth refresh failed — reconnect Zoho')
  }

  const body = await response.json()

  if (!body?.access_token || typeof body.expires_in !== 'number') {
    await supabase.from('system_status').update({ zoho_connected: false, last_error: body?.error ?? 'Zoho token refresh failed', updated_at: new Date().toISOString() }).eq('id', true)
    throw new ZohoAuthError(body?.error ?? 'Zoho OAuth refresh failed — reconnect Zoho')
  }

  const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString()
  await supabase.from('zoho_oauth_state').update({ access_token: body.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', true)
  await supabase.from('system_status').update({ zoho_connected: true, last_error: null, updated_at: new Date().toISOString() }).eq('id', true)
  return body.access_token
}

export async function sendEmail(
  supabase: SupabaseClient,
  { to, subject, htmlBody }: { to: string; subject: string; htmlBody: string }
): Promise<{ messageId: string }> {
  const token = await getAccessToken(supabase)
  const response = await fetch(
    `https://mail.zoho.com/api/accounts/${process.env.ZOHO_ACCOUNT_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromAddress: process.env.ZOHO_FROM_ADDRESS,
        toAddress: to,
        subject,
        content: htmlBody,
        mailFormat: 'html',
      }),
    }
  )

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ZohoSendError(`Zoho send failed with status ${response.status} and an unreadable response body`)
  }

  if (!response.ok) {
    throw new ZohoSendError(payload?.data?.moreInfo ?? payload?.message ?? `Zoho send failed with status ${response.status}`)
  }
  return { messageId: payload.data.messageId }
}
