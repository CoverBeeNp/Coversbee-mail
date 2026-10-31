function labelValue(lines: string[], label: string): string | null {
  const idx = lines.findIndex((l) => l.trim() === label)
  if (idx === -1 || idx + 1 >= lines.length) return null
  const value = lines[idx + 1].trim()
  // Return null if value is empty or if it's another label (ends with ':')
  return value === '' || value.endsWith(':') ? null : value
}

export type ParsedCustomerDetails = { name: string | null; email: string | null; phone: string | null }

// For pasting just a customer's "Customer Details" block (e.g. from a
// Blanxer order page) when manually adding a pre-existing customer. Handles
// both a hand-typed paste and a real browser copy-paste, which inserts blank
// lines between every field.
export function parseCustomerDetails(rawText: string): ParsedCustomerDetails {
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  return {
    name: labelValue(lines, 'Name:'),
    email: labelValue(lines, 'Email:'),
    phone: labelValue(lines, 'Phone Number:'),
  }
}
