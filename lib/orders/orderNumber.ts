// Continues the "ORD-XXXX" sequence used for orders entered outside
// Blanxer — the number staff would type next is always one past whatever
// the highest existing one is, regardless of source (Blanxer's own numeric
// order numbers never take this "ORD-" form, so they never factor in).
export function nextOrderNumber(existingNumbers: string[]): string {
  const highest = existingNumbers.reduce((max, num) => {
    const match = num.match(/(\d+)$/)
    if (!match) return max
    return Math.max(max, parseInt(match[1], 10))
  }, 0)
  return `ORD-${String(highest + 1).padStart(4, '0')}`
}
