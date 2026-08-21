import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'

export default async function CampaignsPage() {
  const supabase = await createServerClient()
  const { data: campaigns } = await supabase.from('campaigns').select('id, name, status, created_at').order('created_at', { ascending: false })
  return (
    <div>
      <h1>Campaigns</h1>
      <Link href="/campaigns/new">+ New campaign</Link>
      <ul>
        {campaigns?.map((c) => (
          <li key={c.id}>
            <Link href={`/campaigns/${c.id}`}>{c.name}</Link> — {c.status}
          </li>
        ))}
      </ul>
    </div>
  )
}
