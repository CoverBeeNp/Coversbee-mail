import type { OrderStatus } from '@/lib/types'

// Blanxer is the source of truth for where an order is. Unknown statuses are
// deliberately absent, so a new Blanxer status leaves an order as it was.
const BLANXER_TO_WORKFLOW: Record<string, OrderStatus> = {
  Processing: 'received',
  'Waiting Pickup': 'received',
  Dispatched: 'dispatched',
  Delivery_Warehouse: 'dispatched',
  Delivery_Transit: 'dispatched',
  Delivery_Today: 'out_for_delivery',
  Delivered: 'delivered',
  Cancelled: 'cancelled',
  // The app has no separate returned status. blanxer_status keeps the real value
  // and revenue excludes both.
  Returned: 'cancelled',
}

const FINAL: OrderStatus[] = ['delivered', 'cancelled']
const PROGRESS: OrderStatus[] = ['received', 'dispatched', 'out_for_delivery', 'delivered']

// The workflow status an order should have, given Blanxer's status.
//
// - A null current status stays null: historical orders and sales outside
//   Blanxer are not in the email workflow.
// - Delivered and Cancelled in Blanxer always apply.
// - In-between statuses only move forward. Staff can send "dispatched" before
//   Blanxer catches up, and moving it back would offer that email again.
export function workflowStatusFromBlanxer(current: OrderStatus | null, blanxerStatus: string): OrderStatus | null {
  if (current === null) return null
  const target = BLANXER_TO_WORKFLOW[blanxerStatus]
  if (!target) return current
  if (FINAL.includes(target)) return target
  if (FINAL.includes(current)) return target
  return PROGRESS.indexOf(target) > PROGRESS.indexOf(current) ? target : current
}
