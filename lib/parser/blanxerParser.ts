export type ParsedItem = { name: string; variant: string | null; unitPrice: number; qty: number; lineTotal: number }
export type ParsedOrder = {
  blanxerOrderNumber: string | null
  items: ParsedItem[]
  subtotal: number | null
  deliveryCharge: number | null
  total: number | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  province: string | null
  city: string | null
  address: string | null
  landmark: string | null
  orderNote: string | null
  unmatchedFields: string[]
}

function toNumber(line: string | undefined): number | null {
  if (!line) return null
  const match = line.match(/रू\s*([\d,]+)/)
  if (!match) return null
  return Number(match[1].replace(/,/g, ''))
}

function labelValue(lines: string[], label: string): string | null {
  const idx = lines.findIndex((l) => l.trim() === label)
  if (idx === -1 || idx + 1 >= lines.length) return null
  const value = lines[idx + 1].trim()
  // Return null if value is empty or if it's another label (ends with ':')
  return value === '' || value.endsWith(':') ? null : value
}

export function parseBlanxerOrder(rawText: string): ParsedOrder {
  const lines = rawText.split('\n').map((l) => l.trim())
  const unmatchedFields: string[] = []

  const orderNumberMatch = rawText.match(/^#(\d+)/m)
  const blanxerOrderNumber = orderNumberMatch ? orderNumberMatch[1] : null

  const cartStart = lines.findIndex((l) => l === 'Cart Items')
  const subtotalIdx = lines.findIndex((l) => l === 'Sub-total')
  const items: ParsedItem[] = []
  if (cartStart !== -1 && subtotalIdx !== -1) {
    let i = cartStart + 1
    while (i < subtotalIdx) {
      if (!/^\d+$/.test(lines[i])) { i++; continue }
      i++ // skip qty line
      const name = lines[i++] ?? ''
      let variant: string | null = null
      if (lines[i]?.startsWith('Variant:')) {
        variant = lines[i].replace('Variant:', '').trim()
        i++
      }
      const priceLine = lines[i++] ?? ''
      const priceMatch = priceLine.match(/रू\s*([\d,]+)\s*x\s*(\d+)/)
      const unitPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : 0
      const qty = priceMatch ? Number(priceMatch[2]) : 0
      const lineTotal = toNumber(lines[i++]) ?? 0
      items.push({ name, variant, unitPrice, qty, lineTotal })
    }
  }

  const subtotal = toNumber(lines[subtotalIdx + 1])
  const deliveryIdx = lines.findIndex((l) => l === 'Delivery Charge')
  const deliveryCharge = toNumber(lines[deliveryIdx + 1])
  const totalIdx = lines.findIndex((l) => l === 'Total')
  const total = toNumber(lines[totalIdx + 1])

  const customerName = labelValue(lines, 'Name:')
  const customerEmail = labelValue(lines, 'Email:')
  const customerPhone = labelValue(lines, 'Phone Number:')
  const province = labelValue(lines, 'Province:')
  const city = labelValue(lines, 'City:')
  const address = labelValue(lines, 'Address:')
  const landmark = labelValue(lines, 'Landmark:')
  const orderNote = labelValue(lines, 'Order Note:')

  if (customerName === null) unmatchedFields.push('customerName')
  if (total === null) unmatchedFields.push('total')

  return {
    blanxerOrderNumber, items, subtotal, deliveryCharge, total,
    customerName, customerEmail, customerPhone, province, city, address, landmark, orderNote,
    unmatchedFields,
  }
}
