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

// Mirrors renderCampaignEmail()/shell()/unsubscribeUrl() in
// lib/zoho/templates.ts — kept in sync manually across the Node/Deno
// runtime boundary (see the file-level comment above). Campaign
// body_template is authored as inner body HTML only (see the "Body HTML"
// textarea in app/campaigns/new/page.tsx) — it must be wrapped in the same
// branded shell (and a real per-recipient unsubscribe link, not a mailto)
// that transactional email and the zoho test-send route use, not sent raw.
function unsubscribeUrl(customerId: string): string {
  const base = (Deno.env.get('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${base}/unsubscribe?customer=${encodeURIComponent(customerId)}`
}

function shell(bodyHtml: string, customerId: string): string {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#fafaf8;">
    <div style="background:#0a0a0a; color:#fbb336; padding:20px; text-align:center; font-size:18px; font-weight:700; letter-spacing:0.02em;">
      CoversBee
    </div>
    <div style="background:#ffffff; padding:24px; color:#0a0a0a;">${bodyHtml}</div>
    <div style="padding:16px; font-size:12px; color:#746f63; text-align:center;">
      coversbee.com.np — <a href="${unsubscribeUrl(customerId)}" style="color:#e29a1e;">Unsubscribe</a>
    </div>
  </div>`
}

function renderCampaignEmail(subject: string, bodyHtml: string, customerId: string): { subject: string; html: string } {
  return { subject, html: shell(bodyHtml, customerId) }
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

// Hard per-invocation cap, independent of the daily cap. This function runs
// hourly via pg_cron (0003_pg_cron_drain.sql), so a smaller batch per run is
// much less likely to exceed the Edge Function platform's wall-clock
// execution limit than trying to push the full remaining daily allowance
// (up to DAILY_CAP, e.g. 200) through in one sequential run.
const MAX_BATCH_SIZE = 50

Deno.serve(async (req) => {
  // Defense against the function being triggered out-of-schedule: it's
  // deployed with --no-verify-jwt (per the plan) so Supabase's platform-level
  // JWT check is off, and the handler must do its own check of the
  // Authorization header the pg_cron job sends (see 0004_fix_drain_cron_auth.sql,
  // which sends `Bearer <DRAIN_FUNCTION_SECRET>` via a Vault-stored value).
  //
  // This deliberately does NOT compare against the platform-auto-injected
  // SUPABASE_SERVICE_ROLE_KEY — on at least one real Supabase Cloud project,
  // that value did not match the service_role key shown in the dashboard
  // (which is otherwise valid and works for normal REST/PostgREST auth),
  // causing every legitimate cron invocation to be rejected. Using our own
  // independently-generated secret (set via `supabase secrets set
  // DRAIN_FUNCTION_SECRET=...` and mirrored into Vault) avoids depending on
  // that platform-internal value at all.
  const expectedAuth = `Bearer ${Deno.env.get('DRAIN_FUNCTION_SECRET')}`
  if (req.headers.get('Authorization') !== expectedAuth) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const { count: sentToday } = await supabase
    .from('email_log').select('*', { count: 'exact', head: true })
    .eq('type', 'marketing').eq('status', 'sent').gte('sent_at', startOfDay.toISOString())

  const remaining = DAILY_CAP - (sentToday ?? 0)
  if (remaining <= 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'daily cap reached' }))

  const batchSize = Math.min(remaining, MAX_BATCH_SIZE)

  const { data: candidates } = await supabase
    .from('campaign_recipients')
    .select('campaign_id, customer_id')
    .eq('status', 'queued')
    .limit(batchSize)

  if (!candidates || candidates.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'nothing queued' }))

  // Atomically claim this batch (queued -> sending) one row at a time, each
  // guarded by .eq('status', 'queued') so a concurrent invocation (e.g. a
  // manual test curl overlapping the scheduled cron tick) can't claim the
  // same row twice — only one of the two concurrent UPDATEs will match and
  // affect a row. Rows this invocation fails to claim (already claimed by
  // another run) are simply skipped.
  const claimed: typeof candidates = []
  for (const c of candidates) {
    const { data: updated } = await supabase
      .from('campaign_recipients')
      .update({ status: 'sending' })
      .eq('campaign_id', c.campaign_id)
      .eq('customer_id', c.customer_id)
      .eq('status', 'queued')
      .select('campaign_id, customer_id')
    if (updated && updated.length > 0) claimed.push(c)
  }

  if (claimed.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no rows claimed (contended by another run)' }))

  // Fetch campaign/customer data separately and join in-memory rather than
  // re-querying campaign_recipients with .in(campaign_id).in(customer_id) —
  // that combination matches the cross product of the two id lists, not the
  // exact (campaign_id, customer_id) pairs this invocation actually claimed,
  // which could pull in rows a concurrent invocation claimed for a different
  // pairing of the same ids.
  const campaignIds = [...new Set(claimed.map((c) => c.campaign_id))]
  const customerIds = [...new Set(claimed.map((c) => c.customer_id))]
  const { data: campaignsData } = await supabase.from('campaigns').select('id, subject, body_template').in('id', campaignIds)
  const { data: customersData } = await supabase.from('customers').select('id, email').in('id', customerIds)
  const campaignById = new Map((campaignsData ?? []).map((c) => [c.id, c]))
  const customerById = new Map((customersData ?? []).map((c) => [c.id, c]))
  const queued = claimed.map((c) => ({
    campaign_id: c.campaign_id,
    customer_id: c.customer_id,
    campaigns: campaignById.get(c.campaign_id),
    customers: customerById.get(c.customer_id),
  }))

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

      const { subject, html } = renderCampaignEmail(campaign.subject, campaign.body_template, row.customer_id)
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

  // 'sending' rows (claimed but not yet resolved — e.g. by a still-running
  // concurrent invocation) count as not-done too, so a campaign isn't
  // prematurely marked 'sent' while another invocation is still processing
  // some of its recipients.
  const { data: distinctCampaigns } = await supabase.from('campaign_recipients').select('campaign_id').in('status', ['queued', 'sending'])
  const stillQueuedCampaignIds = new Set((distinctCampaigns ?? []).map((r) => r.campaign_id))
  const { data: sendingCampaigns } = await supabase.from('campaigns').select('id').eq('status', 'sending')
  for (const c of sendingCampaigns ?? []) {
    if (!stillQueuedCampaignIds.has(c.id)) await supabase.from('campaigns').update({ status: 'sent' }).eq('id', c.id)
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount }))
})
