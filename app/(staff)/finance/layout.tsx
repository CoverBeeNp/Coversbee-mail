import { requireUser } from '@/lib/auth/requireUser'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return children
}
