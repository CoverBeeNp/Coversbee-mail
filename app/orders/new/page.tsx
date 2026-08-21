'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseOrder, saveOrder } from '../actions'
import type { ParsedOrder } from '@/lib/parser/blanxerParser'

export default function NewOrderPage() {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParsedOrder | null>(null)
  const router = useRouter()

  async function handleParse() {
    setParsed(await parseOrder(rawText))
  }

  async function handleSave() {
    if (!parsed) return
    const { orderId } = await saveOrder({ rawPastedText: rawText, parsed })
    router.push(`/orders/${orderId}`)
  }

  function updateField<K extends keyof ParsedOrder>(key: K, value: ParsedOrder[K]) {
    if (!parsed) return
    setParsed({ ...parsed, [key]: value })
  }

  if (!parsed) {
    return (
      <div>
        <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={20} placeholder="Paste the Blanxer order page text here" />
        <button onClick={handleParse}>Parse</button>
      </div>
    )
  }

  return (
    <div>
      <div>
        <h2>Confirm order details</h2>
        {(['customerName', 'customerEmail', 'customerPhone', 'city', 'address'] as const).map((field) => (
          <label key={field}>
            {field} {parsed.unmatchedFields.includes(field) && <strong>(needs review)</strong>}
            <input value={parsed[field] ?? ''} onChange={(e) => updateField(field, e.target.value)} />
          </label>
        ))}
        <p>Total: {parsed.total ?? <strong>(needs review)</strong>}</p>
        <ul>{parsed.items.map((item, i) => <li key={i}>{item.name} {item.variant} x{item.qty} — {item.lineTotal}</li>)}</ul>
        <button onClick={handleSave}>Save order</button>
      </div>
      <pre>{rawText}</pre>
    </div>
  )
}
