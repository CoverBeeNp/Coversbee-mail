import { requireUser } from '@/lib/auth/requireUser'
import { FinanceNav } from './FinanceNav'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return (
    <>
      <FinanceNav />
      {children}
    </>
  )
}
