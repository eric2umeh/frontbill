'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { PageLoadingState } from '@/components/loading-screen'

function RedirectInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    router.replace(`/daily-book${qs ? `?${qs}` : ''}${hash}`)
  }, [router, searchParams])

  return <PageLoadingState label="Opening daily book…" />
}

export default function TransactionsDailyBookRedirectPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Opening daily book…" />}>
      <RedirectInner />
    </Suspense>
  )
}
