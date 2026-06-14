'use client'

import { Suspense } from 'react'
import { PurchasingWorkspace } from '@/components/supply-chain/purchasing-workspace'
import { Loader2 } from 'lucide-react'

export default function SupplyPurchasingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <PurchasingWorkspace />
    </Suspense>
  )
}
