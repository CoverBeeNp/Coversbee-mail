'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createManualOrder, findPossibleDuplicate, type PossibleDuplicate } from '@/lib/orders/manualOrders'
import { useModalClose } from '../Modal'

const OTHER_MODEL = '__other__'

export function ManualOrderForm({
  modelOptions,
  defaultOrderNumber,
}: {
  modelOptions: string[]
  defaultOrderNumber: string
}) {
  const router = useRouter()
  const closeModal = useModalClose()
  const [orderNumber, setOrderNumber] = useState(defaultOrderNumber)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [productName, setProductName] = useState('')
  const [color, setColor] = useState('')
  const [phoneModel, setPhoneModel] = useState('')
  const [customPhoneModel, setCustomPhoneModel] = useState('')
  const [qty, setQty] = useState('1')
  const [total, setTotal] = useState('')
  const [status, setStatus] = useState('Delivered')
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<PossibleDuplicate | null>(null)

  async function submitOrder() {
    const resolvedModel = phoneModel === OTHER_MODEL ? customPhoneModel : phoneModel
    await createManualOrder({
      orderNumber,
      customerName,
      customerPhone,
      productName,
      color: color || null,
      phoneModel: resolvedModel || null,
      qty: Number(qty),
      total: Number(total),
      status,
      orderDate: new Date(orderDate).toISOString(),
    })
    router.refresh()
    closeModal()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      // Once the user has seen the warning and chosen to submit anyway,
      // don't check again — the checkbox-like `duplicateWarning` state
      // itself is that acknowledgement.
      if (!duplicateWarning) {
        const match = await findPossibleDuplicate({
          customerPhone,
          total: Number(total),
          orderDate: new Date(orderDate).toISOString(),
        })
        if (match) {
          setDuplicateWarning(match)
          setPending(false)
          return
        }
      }
      await submitOrder()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this order')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="orderNumber">Order number</label>
        <input id="orderNumber" type="text" className="field-input" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} required />
      </div>
      <div>
        <label className="field-label" htmlFor="customerName">Customer name</label>
        <input id="customerName" type="text" className="field-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label" htmlFor="customerPhone">Customer phone</label>
        <input
          id="customerPhone"
          type="text"
          className="field-input"
          value={customerPhone}
          onChange={(e) => { setCustomerPhone(e.target.value); setDuplicateWarning(null) }}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="productName">Product name</label>
          <input id="productName" type="text" className="field-input" value={productName} onChange={(e) => setProductName(e.target.value)} required />
        </div>
        <div>
          <label className="field-label" htmlFor="color">Color</label>
          <input id="color" type="text" className="field-input" placeholder="e.g. Brown" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="phoneModel">Phone model</label>
          <select id="phoneModel" className="field-input" value={phoneModel} onChange={(e) => setPhoneModel(e.target.value)}>
            <option value="">None</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
            <option value={OTHER_MODEL}>Other…</option>
          </select>
          {phoneModel === OTHER_MODEL && (
            <input
              type="text"
              className="field-input mt-2"
              placeholder="e.g. iPhone 13"
              value={customPhoneModel}
              onChange={(e) => setCustomPhoneModel(e.target.value)}
            />
          )}
        </div>
        <div>
          <label className="field-label" htmlFor="qty">Quantity</label>
          <input id="qty" type="number" min="1" className="field-input" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="total">Total paid (Rs)</label>
        <input
          id="total"
          type="number"
          step="0.01"
          className="field-input"
          value={total}
          onChange={(e) => { setTotal(e.target.value); setDuplicateWarning(null) }}
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor="status">Status</label>
        <input id="status" type="text" className="field-input" value={status} onChange={(e) => setStatus(e.target.value)} required />
      </div>
      <div>
        <label className="field-label" htmlFor="orderDate">Order date</label>
        <input
          id="orderDate"
          type="datetime-local"
          className="field-input"
          value={orderDate}
          onChange={(e) => { setOrderDate(e.target.value); setDuplicateWarning(null) }}
          required
        />
      </div>
      {error ? <p className="alert-error">{error}</p> : null}
      {duplicateWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            This looks like it might be the same order as <strong>{duplicateWarning.orderNumber}</strong>, placed{' '}
            {duplicateWarning.orderDate.slice(0, 10)} — same phone number and amount. Submitting again will add a second, separate order.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-outline" onClick={() => setDuplicateWarning(null)}>
              Go back and check
            </button>
          </div>
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Adding…' : duplicateWarning ? 'Add anyway' : 'Add order'}
      </button>
    </form>
  )
}
