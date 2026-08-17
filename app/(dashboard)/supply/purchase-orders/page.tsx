'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { useAuth } from '@/lib/auth-context'
import {
  canAccessSupplyPurchaseOrdersMenu,
  canAdminTestApproveSupplyPo,
  canSupplyPoAccountantReview,
  canSupplyPoManagerReview,
  canSupplyRetirementReview,
} from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PoApprovalPanel } from '@/components/supply-chain/po-approval-panel'
import { PoRetirementPanel } from '@/components/supply-chain/po-retirement-panel'
import { ClipboardCheck, FileCheck2, Loader2 } from 'lucide-react'

function PurchaseOrdersPageContent() {
  const mounted = useClientMounted()
  const { role } = useAuth()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const menuOk = canAccessSupplyPurchaseOrdersMenu(role)
  const canApprove =
    menuOk &&
    (canSupplyPoAccountantReview(role) ||
      canSupplyPoManagerReview(role) ||
      canAdminTestApproveSupplyPo(role))
  const canRetirement = menuOk && canSupplyRetirementReview(role)

  const [activeTab, setActiveTab] = useState(
    canApprove ? 'approvals' : canRetirement ? 'retirement' : 'approvals',
  )

  useEffect(() => {
    if (tabParam === 'retirement' && canRetirement) setActiveTab('retirement')
    if (tabParam === 'approvals' && canApprove) setActiveTab('approvals')
    if (tabParam === 'purchase_orders' && canApprove) setActiveTab('approvals')
  }, [tabParam, canApprove, canRetirement])

  if (!canApprove && !canRetirement) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Purchase order approvals are available to Accountant, Manager, Administrator,
        Superadmin, and Auditor. Store and kitchen raise POs from Central Store / Kitchen.
      </div>
    )
  }

  // Radix Tabs useId() mismatches SSR vs client under Suspense/useSearchParams —
  // defer until mount so aria ids are client-only.
  if (!mounted) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Purchase orders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve raised POs. After manager approval, POs move to Central Store History
          (read-only). Store or purchaser retires at market from Purchasing — stock is added
          immediately, with a notification to accountant, manager, admin, and superadmin.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {canApprove && (
            <TabsTrigger value="approvals" className="gap-1.5">
              <FileCheck2 className="h-4 w-4" />
              Approvals
            </TabsTrigger>
          )}
          {canRetirement && (
            <TabsTrigger value="retirement" className="gap-1.5">
              <ClipboardCheck className="h-4 w-4" />
              Retirement
            </TabsTrigger>
          )}
        </TabsList>

        {canApprove && (
          <TabsContent value="approvals" className="mt-4">
            <PoApprovalPanel />
          </TabsContent>
        )}

        {canRetirement && (
          <TabsContent value="retirement" className="mt-4">
            <PoRetirementPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export default function SupplyPurchaseOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <PurchaseOrdersPageContent />
    </Suspense>
  )
}
