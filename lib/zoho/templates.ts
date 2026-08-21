import type { ParsedItem } from '@/lib/parser/blanxerParser'
import type { OrderStatus } from '@/lib/types'

// Customer-supplied values (name, item name/variant) come from the Blanxer
// order paste, which ultimately originates from customer-entered checkout
// data — escape before interpolating into HTML so a name like
// `<a href="...">` can't render as a live link, and `&`/`<` in a product
// name can't mangle the markup, in a DKIM-signed email from
// info@coversbee.com.np. Do NOT apply this to staff-authored campaign body
// HTML (renderCampaignEmail's bodyHtml) — that's meant to render as HTML.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Once the app is deployed to a public URL, replace the text wordmark below
// with `<img src="https://<your-domain>/logo.png" width="32" height="32" ... />`
// — email clients need a publicly reachable image URL, which doesn't exist
// pre-deployment, so this stays text-only for now.
function shell(bodyHtml: string): string {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#fafaf8;">
    <div style="background:#0a0a0a; color:#fbb336; padding:20px; text-align:center; font-size:18px; font-weight:700; letter-spacing:0.02em;">
      CoversBee
    </div>
    <div style="background:#ffffff; padding:24px; color:#0a0a0a;">${bodyHtml}</div>
    <div style="padding:16px; font-size:12px; color:#746f63; text-align:center;">
      coversbee.com.np — <a href="mailto:info@coversbee.com.np?subject=Unsubscribe" style="color:#e29a1e;">Unsubscribe</a>
    </div>
  </div>`
}

function itemsHtml(items: ParsedItem[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i.name)}${i.variant ? ` (${escapeHtml(i.variant)})` : ''} x${i.qty} — रू ${i.lineTotal}</li>`).join('')}</ul>`
}

const COPY: Record<OrderStatus, { subjectPrefix: string; message: string }> = {
  received: { subjectPrefix: 'Order received', message: 'We have received your order.' },
  dispatched: { subjectPrefix: 'Order dispatched', message: 'Your order is on its way.' },
  delivered: { subjectPrefix: 'Order delivered', message: 'Your order has been delivered. Thank you for shopping with us!' },
  cancelled: { subjectPrefix: 'Order cancelled', message: 'Your order has been cancelled.' },
}

export function renderTransactionalEmail(
  status: OrderStatus,
  order: { blanxerOrderNumber: string | null; items: ParsedItem[]; total: number | null; customerName: string | null }
): { subject: string; html: string } {
  const copy = COPY[status]
  const subject = `${copy.subjectPrefix} — Order #${order.blanxerOrderNumber ?? ''}`.trim()
  const html = shell(`
    <p>Hi ${order.customerName ? escapeHtml(order.customerName) : 'there'},</p>
    <p>${copy.message}</p>
    ${itemsHtml(order.items)}
    <p><strong>Total: रू ${order.total ?? ''}</strong></p>
  `)
  return { subject, html }
}

export function renderCampaignEmail(subject: string, bodyHtml: string): { subject: string; html: string } {
  return { subject, html: shell(bodyHtml) }
}
