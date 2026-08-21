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
