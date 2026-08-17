import type { Metadata } from 'next'
import { TransactionsSectionLayout } from '@/components/transactions/transactions-section-layout'

export const metadata: Metadata = { title: 'Transactions' }

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return <TransactionsSectionLayout>{children}</TransactionsSectionLayout>
}
