export type OrderStatus = 'received' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'cancelled'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Received',
  dispatched: 'Dispatched',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
