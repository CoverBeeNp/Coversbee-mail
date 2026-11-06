// Builds the filters for searching every tracked order, not just the latest
// page. PostgREST filters travel in the URL and treat commas, brackets and
// quotes as syntax, so the search text is reduced to characters that can
// appear in a name, phone, email or order number.
export function cleanSearchText(text: string): string {
  return text
    .replace(/[^\p{L}\p{M}\p{N}@.+\- ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Customers whose name, phone or email contains the text.
export function customerSearchFilter(text: string): string {
  const pattern = `"%${text}%"`
  return `name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`
}

// Orders whose number contains the text, or that belong to a matching customer.
export function orderSearchFilter(text: string, customerIds: string[]): string {
  const filters = [`blanxer_order_number.ilike."%${text}%"`]
  if (customerIds.length > 0) filters.push(`customer_id.in.(${customerIds.join(',')})`)
  return filters.join(',')
}
