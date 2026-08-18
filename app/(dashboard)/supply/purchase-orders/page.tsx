'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { PurchaseOrdersWorkspace } from '@/components/supply-chain/purchase-orders-workspace'

export default function SupplyPurchaseOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PurchaseOrdersWorkspace />
    </Suspense>
  )
}
