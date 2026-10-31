import type { BlanxerApiOrderDetail } from './types'

type MappedItem = { name: string; color: string | null; variant: string | null; unitPrice: number; qty: number; lineTotal: number }

export type MappedOrder = {
  blanxerId: string
  blanxerCustomerId: string | null
  orderNumber: string
  status: string
  createdAt: string
  blanxerUpdatedAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  items: MappedItem[]
  subtotal: number
  deliveryCharge: number
  total: number
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  address: string | null
  trackingUrl: string | null
}

// Blanxer stores a variant as "Color/Model" (e.g. "Deep Purple/iPhone
// 14Pro"). Splitting only on the FIRST slash keeps a multi-model
// compatibility string like "Brown/iPhone 13/14/15" intact as one model
// value rather than chopping it again on its own internal slashes. A
// variant with no slash at all (just a color, or just a model) is kept as
// the model with no color, since there's nothing to safely split.
function splitVariant(variantName: string | null | undefined): { color: string | null; model: string | null } {
  if (!variantName) return { color: null, model: null }
  const slashIndex = variantName.indexOf('/')
  if (slashIndex === -1) return { color: null, model: variantName }
  return { color: variantName.slice(0, slashIndex).trim() || null, model: variantName.slice(slashIndex + 1).trim() || null }
}

// Order-level discount: d_type 2 = PERCENT (d_value is a percentage of the
// product subtotal, not a currency amount); every other d_type stores
// d_value as a currency amount to subtract directly.
function discountAmount(subtotal: number, discount: BlanxerApiOrderDetail['discount']): number {
  if (!discount?.d_value) return 0
  return discount.d_type === 2 ? subtotal * (discount.d_value / 100) : discount.d_value
}

// One display string for the email templates, which need a single address
// rather than the four separate Blanxer fields.
function formatAddress(detail: Pick<BlanxerApiOrderDetail, 'customer_address' | 'customer_address_landmark' | 'customer_address_city' | 'customer_address_province'>): string | null {
  const parts = [
    detail.customer_address,
    detail.customer_address_landmark,
    detail.customer_address_city,
    detail.customer_address_province,
  ].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(', ') : null
}

// The order's real creation timestamp lives on Blanxer's order-LIST item, not
// on the detail response, so the caller passes it through here.
export function mapBlanxerOrder(detail: BlanxerApiOrderDetail, createdAt: string): MappedOrder {
  // Blanxer's responses are untyped JSON; guard before doing arithmetic so a
  // malformed payload fails loudly instead of producing NaN totals that would
  // silently corrupt every downstream aggregate.
  if (!Array.isArray(detail.ordered_products) || !Number.isFinite(detail.product_total_price)) {
    throw new Error(`Malformed Blanxer order detail for order ${detail._id}`)
  }

  const subtotal = detail.product_total_price

  const items: MappedItem[] = detail.ordered_products.map((p) => {
    const { color, model } = splitVariant(p.variant_name || null)
    return {
      name: p.product_name,
      color,
      variant: model,
      unitPrice: p.price,
      qty: p.quantity,
      lineTotal: p.price * p.quantity - (p.discount_amount ?? 0),
    }
  })

  // Subtract per-item discounts as well as the order-level discount, so the
  // order `total` reconciles with the sum of the items' `lineTotal`s (the
  // "Top products" aggregate sums lineTotals; "Revenue by month" sums totals).
  const itemDiscounts = detail.ordered_products.reduce((sum, p) => sum + (p.discount_amount ?? 0), 0)
  const total = Math.max(
    0,
    subtotal + detail.delivery_charge - discountAmount(subtotal, detail.discount) - itemDiscounts
  )

  return {
    blanxerId: detail._id,
    blanxerCustomerId: detail.customer || null,
    orderNumber: String(detail.order_number),
    status: detail.status,
    createdAt,
    blanxerUpdatedAt: detail.updated_at ?? null,
    dispatchedAt: detail.dispatched_at ?? null,
    deliveredAt: detail.delivered_at ?? null,
    items,
    subtotal,
    deliveryCharge: detail.delivery_charge,
    total,
    customerName: detail.customer_full_name || null,
    customerEmail: detail.customer_email || null,
    customerPhone: detail.customer_phone_number || null,
    address: formatAddress(detail),
    trackingUrl: detail.shipment_tracking || null,
  }
}
