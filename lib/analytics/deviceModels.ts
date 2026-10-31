import { isRevenueOrder } from './orderFilters'
import { normalizeKey, trackDisplayName, mostCommonDisplayName } from './nameGrouping'

type ItemForModels = { variant: string | null; qty: number }
export type OrderForModels = { status: string; parsedItems: ItemForModels[] }
export type DeviceModelPerformance = { model: string; unitsSold: number }

// Variants are hand-entered as "Color/Model" (e.g. "Deep Purple/iPhone
// 14Pro"), but some variants are just a device model with no color prefix
// ("iPhone 13Promax") and some are just a color with no device at all
// ("Gray") — those last ones have nothing to extract and are skipped.
const DEVICE_KEYWORD = /iphone|ipad|samsung|galaxy|redmi|poco|oneplus|xiaomi|pixel/i

export function extractModel(variant: string | null): string | null {
  if (!variant) return null
  const trimmed = variant.trim()
  if (!trimmed) return null

  // Only split on the FIRST slash — a multi-model compatibility string like
  // "Brown/iPhone 13/14/15" should stay intact as one model label, not get
  // chopped again on its own internal slashes.
  const slashIndex = trimmed.indexOf('/')
  const candidate = slashIndex === -1 ? trimmed : trimmed.slice(slashIndex + 1).trim()
  if (!candidate) return null

  const looksLikeADevice = DEVICE_KEYWORD.test(candidate) || /\d/.test(candidate)
  return looksLikeADevice ? candidate : null
}

export function deviceModelPerformance(orders: OrderForModels[]): DeviceModelPerformance[] {
  const totals = new Map<string, number>()
  const displayNameCounts = new Map<string, Map<string, number>>()

  for (const order of orders) {
    if (!isRevenueOrder(order.status)) continue
    for (const item of order.parsedItems) {
      const model = extractModel(item.variant)
      if (!model) continue
      const key = normalizeKey(model)
      totals.set(key, (totals.get(key) ?? 0) + item.qty)
      trackDisplayName(displayNameCounts, key, model)
    }
  }

  return [...totals.entries()]
    .map(([key, unitsSold]) => ({ model: mostCommonDisplayName(displayNameCounts, key), unitsSold }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
}
