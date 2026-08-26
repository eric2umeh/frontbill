'use client'

import { Suspense } from 'react'
import { DailyFrontDeskPanel } from '@/components/reports/daily-front-desk-panel'
import { PageLoadingState } from '@/components/loading-screen'

export default function DailyBookPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading daily book…" />}>
      <DailyFrontDeskPanel />
    </Suspense>
  )
}
