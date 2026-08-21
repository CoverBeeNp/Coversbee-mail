// supabase/functions/drain-campaign-queue/index.ts
//
// Deno Edge Function — hourly pg_cron target that throttled-drains
// campaign_recipients queued by app/api/campaigns/send/route.ts (Task 7).
//
// Runtime note: this runs on Deno (Supabase Edge Functions), not Node.js.
// The supabase-js import below is a URL import (esm.sh), which is the
// correct way to pull an npm package into Deno — do not change it to a bare
// npm-style import. Because Deno and the Next.js app are separate runtimes
// that can't share local TS modules, the small pieces of app logic this
// function needs (the Zoho client and the campaign email shell from
// lib/zoho/templates.ts) are duplicated here rather than imported.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DAILY_CAP = Number(Deno.env.get('ZOHO_DAILY_CAP') ?? '200')

// Mirrors renderCampaignEmail()/shell() in lib/zoho/templates.ts. Campaign
// body_template is authored as inner body HTML only (see the "Body HTML"
// textarea in app/campaigns/new/page.tsx) — it must be wrapped in the same
// branded shell (and unsubscribe link) that transactional email and the
// zoho test-send route use, not sent raw.
function shell(bodyHtml: string): string {
  return `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background:#7a2e2e; color:#fff; padding:16px; text-align:center;">
      <strong>CoversBee</strong>
    </div>
    <div style="padding:24px;">${bodyHtml}</div>
    <div style="padding:16px; font-size:12px; color:#888; text-align:center;">
      coversbee.com.np — <a href="mailto:info@coversbee.com.np?subject=Unsubscribe">Unsubscribe</a>
    </div>
  </div>`
}

function renderCampaignEmail(subject: string, bodyHtml: string): { subject: string; html: string } {
  return { subject, html: shell(bodyHtml) }
}

async function getAccessToken(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: row } = await supabase.from('zoho_oauth_state').select('access_token, expires_at').single()
  if (row?.access_token && row.expires_at && new Date(row.expires_at) > new Date()) return row.access_token

  const params = new URLSearchParams({
    refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN')!,
    client_id: Deno.env.get('ZOHO_CLIENT_ID')!,
    client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
    grant_type: 'refresh_token',
  })
  const res = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: 'POST' })
  if (!res.ok) {
    await supabase.from('system_status').update({ zoho_connected: false, last_error: 'Zoho token refresh failed', updated_at: new Date().toISOString() }).eq('id', true)
    throw new Error('Zoho OAuth refresh failed')
  }
  const body = await res.json()
  const expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString()
  await supabase.from('zoho_oauth_state').update({ access_token: body.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('id', true)
  return body.access_token
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const { count: sentToday } = await supabase
    .from('email_log').select('*', { count: 'exact', head: true })
    .eq('type', 'marketing').eq('status', 'sent').gte('sent_at', startOfDay.toISOString())

  const remaining = DAILY_CAP - (sentToday ?? 0)
  if (remaining <= 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'daily cap reached' }))

  const { data: queued } = await supabase
    .from('campaign_recipients')
    .select('campaign_id, customer_id, campaigns(subject, body_template), customers(email)')
    .eq('status', 'queued')
    .limit(remaining)

  let sentCount = 0

  // Fetch (and, if needed, refresh) the Zoho access token once up front
  // rather than inside the per-recipient loop. getAccessToken() only hits
  // Zoho's real refresh endpoint when the cached token is missing/expired,
  // so when credentials are genuinely broken every recipient in the batch
  // would otherwise trigger its own failing OAuth refresh call — up to
  // `remaining` (capped at DAILY_CAP, e.g. 200) real requests to Zoho's
  // token endpoint in a single invocation. Resolving it once means a broken
  // refresh token fails fast (one Zoho call) and every recipient is then
  // marked failed locally without hammering Zoho further.
  let token: string | undefined
  let tokenError: Error | undefined
  try {
    token = await getAccessToken(supabase)
  } catch (err) {
    tokenError = err as Error
  }

  for (const row of queued ?? []) {
    const campaign = (row as any).campaigns
    const customer = (row as any).customers
    try {
      if (!customer?.email) throw new Error('Customer has no email on file')
      if (!token) throw tokenError ?? new Error('Zoho OAuth refresh failed')

      const { subject, html } = renderCampaignEmail(campaign.subject, campaign.body_template)
      const res = await fetch(`https://mail.zoho.com/api/accounts/${Deno.env.get('ZOHO_ACCOUNT_ID')}/messages`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAddress: Deno.env.get('ZOHO_FROM_ADDRESS'), toAddress: customer.email, subject, content: html, mailFormat: 'html' }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.data?.moreInfo ?? `Zoho send failed with status ${res.status}`)

      await supabase.from('campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('campaign_id', row.campaign_id).eq('customer_id', row.customer_id)
      await supabase.from('email_log').insert({ customer_id: row.customer_id, type: 'marketing', template_used: row.campaign_id, status: 'sent', zoho_message_id: payload.data.messageId })
      sentCount++
    } catch (err) {
      await supabase.from('campaign_recipients').update({ status: 'failed' }).eq('campaign_id', row.campaign_id).eq('customer_id', row.customer_id)
      await supabase.from('email_log').insert({ customer_id: row.customer_id, type: 'marketing', template_used: row.campaign_id, status: 'failed', error_message: (err as Error).message })
    }
  }

  const { data: distinctCampaigns } = await supabase.from('campaign_recipients').select('campaign_id').eq('status', 'queued')
  const stillQueuedCampaignIds = new Set((distinctCampaigns ?? []).map((r) => r.campaign_id))
  const { data: sendingCampaigns } = await supabase.from('campaigns').select('id').eq('status', 'sending')
  for (const c of sendingCampaigns ?? []) {
    if (!stillQueuedCampaignIds.has(c.id)) await supabase.from('campaigns').update({ status: 'sent' }).eq('id', c.id)
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount }))
})
