// Direct-HTTP client for Blanxer's order-read API — used by
// app/api/blanxer/sync-orders to pull new orders instead of relying on the
// manual copy-paste flow. Blanxer has no webhook/push mechanism, so "sync"
// here means polling GET /order/:store_id on demand.
import type { BlanxerApiOrderDetail } from '@/lib/parser/blanxerParser'

const BASE_URL = 'https://api.blanxer.com'

// Blanxer sits behind Cloudflare's bot-fingerprint challenge — plain HTTP
// clients without these headers get a 403 "error code: 1010" on every
// route, including this exchange call, not just the mutating ones.
const CF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Origin: 'https://app.blanxer.com',
  Referer: 'https://app.blanxer.com/',
}

export type BlanxerOrderListItem = {
  _id: string
  order_number: number
  created_at: string
}

export async function exchangeBlanxerApiKey(apiKey: string): Promise<{ token: string; storeId: string }> {
  const res = await fetch(`${BASE_URL}/api-key/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...CF_HEADERS },
    body: JSON.stringify({ api_key: apiKey }),
  })
  if (!res.ok) throw new Error(`Blanxer API key exchange failed (${res.status})`)
  const body = await res.json()
  return { token: body.token as string, storeId: body.store._id as string }
}

// Blanxer's list endpoint returns projected fields only (no per-item price,
// no customer email/address) — just enough to know which orders exist and
// when they were created, so we can decide which are new before paying for
// a full detail fetch on each one.
export async function listBlanxerOrders(token: string, storeId: string, fromIso: string, toIso: string): Promise<BlanxerOrderListItem[]> {
  const qs = new URLSearchParams({ from: fromIso, to: toIso })
  const res = await fetch(`${BASE_URL}/order/${storeId}?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...CF_HEADERS },
  })
  if (!res.ok) throw new Error(`Blanxer order list failed (${res.status})`)
  const body = await res.json()
  return (body.orders ?? []) as BlanxerOrderListItem[]
}

export async function getBlanxerOrderDetail(token: string, storeId: string, orderId: string): Promise<BlanxerApiOrderDetail> {
  const res = await fetch(`${BASE_URL}/order/${storeId}/${orderId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...CF_HEADERS },
  })
  if (!res.ok) throw new Error(`Blanxer order detail failed (${res.status})`)
  return (await res.json()) as BlanxerApiOrderDetail
}
