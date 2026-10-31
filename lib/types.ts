export type OrderStatus = 'received' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'cancelled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  dispatched: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  received: 'badge-neutral',
  dispatched: 'badge-gold',
  out_for_delivery: 'badge-gold',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
}

// Blanxer's status codes, for reading: "Delivery_Transit" becomes "Delivery Transit".
export function blanxerStatusLabel(status: string | null): string {
  return status?.replace(/_/g, ' ') ?? '—'
}

// One line of orders.parsed_items. Orders stored before colour was split out
// keep the whole "Color/Model" string in `variant` and have no `color`.
export type OrderItem = {
  name: string
  color?: string | null
  variant: string | null
  unitPrice: number
  qty: number
  lineTotal: number
}

// Rebuilds the customer-facing "Color/Model" label from its stored parts.
export function itemVariantLabel(item: Pick<OrderItem, 'color' | 'variant'>): string | null {
  return [item.color, item.variant].filter(Boolean).join('/') || null
}
