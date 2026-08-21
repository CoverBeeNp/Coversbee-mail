import type { ParsedItem } from '@/lib/parser/blanxerParser'
import type { OrderStatus } from '@/lib/types'

const CUSTOMER_CARE_EMAIL = 'info@coversbee.com.np'
const CARRIER_NAME = 'Nepal Can Move'
const GOOGLE_REVIEW_URL = 'https://g.page/r/CeedE59zZPfHEAI/review'

// Customer-supplied values (name, address, item name/variant) come from the
// Blanxer order paste, which ultimately originates from customer-entered
// checkout data — escape before interpolating into HTML so a name like
// `<a href="...">` can't render as a live link, and `&`/`<` in a product
// name or address can't mangle the markup, in a DKIM-signed email from
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

// NEXT_PUBLIC_-prefixed (not just APP_URL) because this module is imported
// by a Client Component (the campaign preview page) as well as server-side
// API routes — a plain APP_URL only exists in process.env on the server, so
// the browser-rendered preview would silently fall back to localhost for
// the logo and unsubscribe links while the real, server-sent email got the
// correct URL. The app's own public URL isn't sensitive, so exposing it to
// the client is fine.
function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

// Builds a real unsubscribe link instead of a mailto — visiting it lands on
// a confirmation page (app/unsubscribe/page.tsx) that only mutates
// subscribed_to_marketing on an explicit POST, never on the GET page load
// itself, since some corporate email scanners pre-fetch links and a
// GET-that-mutates would silently unsubscribe people. Falls back to a plain
// link with no customer id for contexts with no specific recipient yet
// (e.g. the campaign builder's preview).
function unsubscribeUrl(customerId?: string): string {
  const base = appBaseUrl()
  return customerId ? `${base}/unsubscribe?customer=${encodeURIComponent(customerId)}` : `${base}/unsubscribe`
}

function shell(bodyHtml: string, customerId?: string): string {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#fafaf8;">
    <div style="background:#0a0a0a; padding:20px; text-align:center;">
      <img src="${appBaseUrl()}/logo.png" alt="CoversBee" width="40" height="39" style="display:block; margin:0 auto 8px; border:0;" />
      <span style="color:#fbb336; font-size:18px; font-weight:700; letter-spacing:0.02em;">CoversBee</span>
    </div>
    <div style="background:#ffffff; padding:24px; color:#0a0a0a; line-height:1.5;">${bodyHtml}</div>
    <div style="padding:16px; font-size:12px; color:#746f63; text-align:center;">
      coversbee.com.np — <a href="${unsubscribeUrl(customerId)}" style="color:#e29a1e;">Unsubscribe</a>
    </div>
  </div>`
}

function itemsHtml(items: ParsedItem[]): string {
  return `<ul style="padding-left:20px; margin:8px 0;">${items
    .map((i) => `<li>${escapeHtml(i.name)}${i.variant ? ` (${escapeHtml(i.variant)})` : ''} x ${i.qty} @ रू ${i.unitPrice}</li>`)
    .join('')}</ul>`
}

type TransactionalOrder = {
  blanxerOrderNumber: string | null
  items: ParsedItem[]
  total: number | null
  customerName: string | null
  address?: string | null
  trackingUrl?: string | null
  customerId?: string | null
}

function orderNumberText(order: TransactionalOrder): string {
  return order.blanxerOrderNumber ?? ''
}

function customerNameText(order: TransactionalOrder): string {
  return order.customerName ? escapeHtml(order.customerName) : 'there'
}

function addressText(order: TransactionalOrder): string {
  return order.address ? escapeHtml(order.address) : 'Not provided'
}

function renderReceived(order: TransactionalOrder): { subject: string; html: string } {
  const orderNumber = orderNumberText(order)
  const subject = `Your Order Confirmation - #${orderNumber}`
  const html = shell(`
    <p>Dear ${customerNameText(order)},</p>
    <p>Thank you for trusting us! We are thrilled to confirm that your order, #${orderNumber}, has been received and is being processed. Here are the details of your order:</p>
    <p><strong>Billing Address:</strong> ${addressText(order)}</p>
    <p><strong>Product Details:</strong></p>
    ${itemsHtml(order.items)}
    <p><strong>Total Price:</strong> रू ${order.total ?? ''}</p>
    <p>We are excited to get your order to you as soon as possible and will keep you updated on the status of your shipment. If you have any questions or concerns, please don&rsquo;t hesitate to contact us.</p>
    <p>Thank you again for your support. Happy shopping!</p>
    <p>Warm Regards,<br>CoversBee</p>
  `, order.customerId ?? undefined)
  return { subject, html }
}

function renderDispatched(order: TransactionalOrder): { subject: string; html: string } {
  const orderNumber = orderNumberText(order)
  const subject = `Yay! Your Order Has Shipped! - #${orderNumber}`
  const trackingLine = order.trackingUrl
    ? `You can track your shipment here: <a href="${escapeHtml(order.trackingUrl)}">${escapeHtml(order.trackingUrl)}</a>.`
    : `We&rsquo;ll share your tracking link as soon as it&rsquo;s available.`
  const html = shell(`
    <p>Hi ${customerNameText(order)},</p>
    <p>We have great news for you! Your order #${orderNumber} has shipped and is on its way to you!</p>
    <p><strong>Shipping Details:</strong><br>
    Carrier: ${CARRIER_NAME}<br>
    ${trackingLine}</p>
    <p>Thank you for choosing us!</p>
    <p>Best,<br>CoversBee</p>
  `, order.customerId ?? undefined)
  return { subject, html }
}

function renderDelivered(order: TransactionalOrder): { subject: string; html: string } {
  const orderNumber = orderNumberText(order)
  const subject = `Your Order Has Been Delivered!`
  const html = shell(`
    <p>Hi ${customerNameText(order)},</p>
    <p>We&rsquo;re pleased to let you know that your order #${orderNumber} has been successfully delivered!</p>
    <p><strong>Delivery Details:</strong><br>Delivery Address: ${addressText(order)}</p>
    <p>We hope you enjoy your purchase! If you have any questions or concerns, please write to our customer care at <a href="mailto:${CUSTOMER_CARE_EMAIL}">${CUSTOMER_CARE_EMAIL}</a>. Our associates will contact you as soon as possible to resolve any issues you have with your order.</p>
    <p>Loved your experience? A quick review helps other customers find CoversBee&rsquo;s products and services:</p>
    <p style="text-align:center; margin:20px 0;">
      <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block; background:#fbb336; color:#0a0a0a; padding:10px 20px; border-radius:999px; font-weight:700; text-decoration:none;">Leave us a review</a>
    </p>
    <p>You&rsquo;ll also receive a text message from us asking you to review the product — replying to that text helps other customers too, so we&rsquo;d appreciate a moment of your time there as well.</p>
    <p>Best,<br>CoversBee</p>
  `, order.customerId ?? undefined)
  return { subject, html }
}

function renderCancelled(order: TransactionalOrder): { subject: string; html: string } {
  const orderNumber = orderNumberText(order)
  const subject = `Your Order Has Been Cancelled - #${orderNumber}`
  const html = shell(`
    <p>Hi ${customerNameText(order)},</p>
    <p>We&rsquo;re writing to let you know that your order #${orderNumber} has been cancelled.</p>
    <p><strong>Order Details:</strong></p>
    ${itemsHtml(order.items)}
    <p><strong>Total Price:</strong> रू ${order.total ?? ''}</p>
    <p>If any payment was made for this order, it will be refunded in full. If you did not request this cancellation or have any questions, please write to our customer care at <a href="mailto:${CUSTOMER_CARE_EMAIL}">${CUSTOMER_CARE_EMAIL}</a> and we&rsquo;ll be happy to help.</p>
    <p>We hope to serve you again soon.</p>
    <p>Best,<br>CoversBee</p>
  `, order.customerId ?? undefined)
  return { subject, html }
}

const RENDERERS: Record<OrderStatus, (order: TransactionalOrder) => { subject: string; html: string }> = {
  received: renderReceived,
  dispatched: renderDispatched,
  delivered: renderDelivered,
  cancelled: renderCancelled,
}

export function renderTransactionalEmail(status: OrderStatus, order: TransactionalOrder): { subject: string; html: string } {
  return RENDERERS[status](order)
}

export function renderCampaignEmail(subject: string, bodyHtml: string, customerId?: string): { subject: string; html: string } {
  return { subject, html: shell(bodyHtml, customerId) }
}
