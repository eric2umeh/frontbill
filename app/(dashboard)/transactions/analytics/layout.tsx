import type { Metadata } from 'next'
import { AnalyticsSectionLayout } from '@/components/transactions/analytics-section-layout'

export const metadata: Metadata = { title: 'Analytics' }

export default function TransactionsAnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AnalyticsSectionLayout>{children}</AnalyticsSectionLayout>
}
