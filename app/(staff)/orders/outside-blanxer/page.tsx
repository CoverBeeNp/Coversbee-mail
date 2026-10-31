import { listManualOrders, getNextManualOrderNumber } from '@/lib/orders/manualOrders'
import { listDeviceModelOptions } from '@/lib/orders/deviceModelOptions'
import { DeleteManualOrderButton } from './DeleteManualOrderButton'
import { AddOrderModal } from './AddOrderModal'
import { formatAmount } from '@/lib/format'
import { toCsv } from '@/lib/csv'
import { ExportCsvButton } from '../../finance/ExportCsvButton'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const [orders, modelOptions, nextOrderNumber] = await Promise.all([
    listManualOrders(),
    listDeviceModelOptions(),
    getNextManualOrderNumber(),
  ])

  const csv = toCsv(
    ['Date', 'Order #', 'Customer', 'Phone', 'Product', 'Color', 'Model', 'Qty', 'Total', 'Status'],
    orders.map((order) => [
      order.orderDate.slice(0, 10),
      order.orderNumber,
      order.customerName,
      order.customerPhone,
      order.productName,
      order.color ?? '',
      order.phoneModel ?? '',
      order.qty,
      order.total,
      order.status,
    ])
  )

  return (
    <div className="page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-ink">Orders outside Blanxer</h1>
          <p className="text-sm text-muted">
            Orders synced from Blanxer are not managed here. This page is only for sales that happened outside Blanxer.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportCsvButton filename="orders.csv" csv={csv} />
          <AddOrderModal modelOptions={modelOptions} defaultOrderNumber={nextOrderNumber} />
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="card text-sm text-muted">No orders added here yet. Add your first one using the Add order button.</div>
      ) : (
        <div className="table-shell overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Order #</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Product</th>
                <th>Color</th>
                <th>Model</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="whitespace-nowrap">{order.orderDate.slice(0, 10)}</td>
                  <td className="whitespace-nowrap">{order.orderNumber}</td>
                  <td>{order.customerName}</td>
                  <td>{order.customerPhone}</td>
                  <td>{order.productName}</td>
                  <td>{order.color}</td>
                  <td>{order.phoneModel}</td>
                  <td>{order.qty}</td>
                  <td className="tabular-nums">{formatAmount(order.total)}</td>
                  <td>{order.status}</td>
                  <td>
                    <DeleteManualOrderButton id={order.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
