'use client'

import { Suspense } from 'react'
import { ProfitabilityPanel } from '@/components/analytics/profitability-panel'
import { PageLoadingState } from '@/components/loading-screen'

export default function TransactionsAnalyticsProfitabilityPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading profitability…" />}>
      <ProfitabilityPanel />
    </Suspense>
  )
}
