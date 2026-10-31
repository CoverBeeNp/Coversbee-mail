// Staff shorthand for iPhone models used in manually entered orders: a
// number followed by R (regular), P (pro), PM (pro max), or PL (plus).
// Normalized to match Blanxer's own naming convention exactly (no space,
// "Promax" not "Pro Max") so a manually entered order's model groups
// together with Blanxer-synced orders of the same model on the "Top device
// models" chart instead of showing up as a separate bar.
const SUFFIX_TO_LABEL: Record<string, string> = {
  R: '',
  P: 'Pro',
  PM: 'Promax',
  PL: 'Plus',
}

export function normalizePhoneModel(code: string | null): string | null {
  if (!code) return null
  const match = code.trim().match(/^(\d+)(PM|PL|P|R)$/i)
  if (!match) return code
  const [, number, suffix] = match
  return `iPhone ${number}${SUFFIX_TO_LABEL[suffix.toUpperCase()]}`
}
