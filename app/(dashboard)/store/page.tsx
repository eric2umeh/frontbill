'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { StoreManager } from '@/components/store/store-manager'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function StorePageInner({ initialTab }: { initialTab?: 'requisitions' | 'purchase_orders' }) {
  const { role } = useAuth()
  const canUseStore =
    hasPermission(role, 'store:view') || hasPermission(role, 'store:requisition')
  if (!canUseStore) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Store</CardTitle>
          <CardDescription>You don&apos;t have permission to view the hotel store.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    )
  }

  return <StoreManager initialTab={initialTab} />
}

function StorePageWithQuery() {
  const searchParams = useSearchParams()
  const t = searchParams.get('tab')
  const initialTab =
    t === 'requisitions' ? 'requisitions' : t === 'purchase_orders' ? 'purchase_orders' : undefined
  return <StorePageInner initialTab={initialTab} />
}

export default function StorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
      }
    >
      <StorePageWithQuery />
    </Suspense>
  )
}
