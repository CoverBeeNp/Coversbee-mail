// Single source of truth for which Blanxer order statuses count as revenue.
// 'Cancelled' orders never happened; 'Returned' orders were refunded — neither
// belongs in revenue. Every aggregate (monthly summary, product performance)
// must use this so the rule can't drift between them.
const NON_REVENUE_STATUSES = new Set(['Cancelled', 'Returned'])

export function isRevenueOrder(status: string): boolean {
  return !NON_REVENUE_STATUSES.has(status)
}
