import { BankBalanceCard } from './BankBalanceCard'
import { DateRangeFilter } from './DateRangeFilter'

export function DashboardTopBar({
  from,
  to,
  bankBalance,
}: {
  from?: string
  to?: string
  bankBalance: number
}) {
  return (
    <div className="card flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <BankBalanceCard amount={bankBalance} />
      <div className="lg:min-w-[480px]">
        <DateRangeFilter from={from} to={to} />
      </div>
    </div>
  )
}
