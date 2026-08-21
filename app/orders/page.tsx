import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

export default async function OrdersPage() {
  const supabase = createServiceClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, blanxer_order_number, status, total, customers(name)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <Link href="/orders/new">+ New order</Link>
      <table>
        <tbody>
          {orders?.map((o) => {
            const customer = o.customers as unknown as { name: string | null } | null
            return (
              <tr key={o.id}>
                <td><Link href={`/orders/${o.id}`}>#{o.blanxer_order_number}</Link></td>
                <td>{customer?.name}</td>
                <td>{o.status}</td>
                <td>{o.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
