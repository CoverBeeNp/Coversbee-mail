// Shared by any aggregation that groups hand-entered catalog text (product
// names, variant/model strings) where the same real-world thing can appear
// under a couple of casings or with stray whitespace — e.g. Blanxer's own
// catalog has both "SIlicon" and "Silicon" as separate product listings.
// Group by a normalized key, but still display whichever exact spelling
// occurred most often, rather than silently picking one arbitrarily.
export function normalizeKey(name: string): string {
  return name.trim().toLowerCase()
}

export function trackDisplayName(counts: Map<string, Map<string, number>>, key: string, displayName: string): void {
  const nameCounts = counts.get(key) ?? new Map<string, number>()
  nameCounts.set(displayName, (nameCounts.get(displayName) ?? 0) + 1)
  counts.set(key, nameCounts)
}

export function mostCommonDisplayName(counts: Map<string, Map<string, number>>, key: string): string {
  const entries = [...counts.get(key)!.entries()]
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}
