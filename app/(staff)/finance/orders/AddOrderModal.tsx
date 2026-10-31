'use client'

import { Modal } from '../Modal'
import { ManualOrderForm } from './ManualOrderForm'

export function AddOrderModal({
  modelOptions,
  defaultOrderNumber,
}: {
  modelOptions: string[]
  defaultOrderNumber: string
}) {
  return (
    <Modal triggerLabel="Add order" triggerClassName="btn-gold" title="Add an order">
      <ManualOrderForm modelOptions={modelOptions} defaultOrderNumber={defaultOrderNumber} />
    </Modal>
  )
}
