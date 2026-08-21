import Image from 'next/image'
import { createServiceClient } from '@/lib/supabase/server'
import { UnsubscribeButton } from './unsubscribe-button'

// Public page — reached from an email footer link, never behind staff auth
// (deliberately not covered by proxy.ts's matcher). Loading this page never
// mutates anything by itself; only the button's POST to /api/unsubscribe
// does, since some corporate email scanners pre-fetch links and a
// GET-that-mutates would silently unsubscribe people who never clicked.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer: customerId } = await searchParams

  if (!customerId) {
    return (
      <Shell title="Invalid unsubscribe link">
        <p>This link is missing information needed to process your request. Please contact us at info@coversbee.com.np.</p>
      </Shell>
    )
  }

  const supabase = createServiceClient()
  const { data: customer } = await supabase
    .from('customers')
    .select('id, email, subscribed_to_marketing')
    .eq('id', customerId)
    .maybeSingle()

  if (!customer) {
    return (
      <Shell title="Link not recognized">
        <p>We couldn&rsquo;t find this subscription. Please contact us at info@coversbee.com.np if you keep receiving unwanted emails.</p>
      </Shell>
    )
  }

  if (!customer.subscribed_to_marketing) {
    return (
      <Shell title="Already unsubscribed">
        <p>{customer.email ?? 'This address'} is not currently subscribed to marketing emails from CoversBee.</p>
      </Shell>
    )
  }

  return (
    <Shell title="Unsubscribe from CoversBee emails?">
      <p>
        You&rsquo;ll stop receiving marketing emails at <strong>{customer.email}</strong>. You&rsquo;ll still get order-status
        emails for any orders you place.
      </p>
      <UnsubscribeButton customerId={customer.id} />
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <Image src="/logo.png" alt="CoversBee" width={40} height={39} className="mx-auto mb-6" />
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  )
}
