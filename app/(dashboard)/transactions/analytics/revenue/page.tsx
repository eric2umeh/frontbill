'use client'

import { Suspense } from 'react'
import { RevenuePanel } from '@/components/analytics/revenue-panel'
import { PageLoadingState } from '@/components/loading-screen'

export default function TransactionsAnalyticsRevenuePage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading revenue…" />}>
      <RevenuePanel />
    </Suspense>
  )
}
