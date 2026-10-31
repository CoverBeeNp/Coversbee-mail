// Manually entered product names mix color and product type into one
// string (e.g. "Purple Half Butterfly"), unlike Blanxer's own data, where
// color is already a separate part of the variant string ("Deep
// Purple/iPhone 14Pro"). This only handles the manual-entry case: pulling
// a leading, recognized color word (optionally preceded by a modifier like
// "Light" or "Dark") off the front of the name. A name that doesn't start
// with a recognized color is left completely unchanged rather than
// guessing — "Birthday Teedy" is a product name, not a color plus product.
const MODIFIERS = new Set(['light', 'dark', 'deep'])
const COLORS = new Set([
  'purple', 'brown', 'black', 'blue', 'pink', 'yellow', 'gray', 'grey',
  'red', 'green', 'white', 'silver', 'gold', 'orange', 'clear', 'rose',
  'cream', 'beige', 'navy', 'teal',
])

export type ColorExtraction = { color: string | null; baseName: string }

export function extractColor(productName: string): ColorExtraction {
  const trimmed = productName.trim()
  const words = trimmed.split(/\s+/)

  if (words.length >= 2 && MODIFIERS.has(words[0].toLowerCase()) && COLORS.has(words[1].toLowerCase())) {
    return { color: `${words[0]} ${words[1]}`, baseName: words.slice(2).join(' ') }
  }

  if (words.length >= 1 && COLORS.has(words[0].toLowerCase())) {
    return { color: words[0], baseName: words.slice(1).join(' ') }
  }

  return { color: null, baseName: trimmed }
}
