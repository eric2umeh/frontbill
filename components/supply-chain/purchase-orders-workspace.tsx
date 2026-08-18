'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  canAccessPoApprovalsTab,
  canAccessSupplyPurchaseOrdersMenu,
  canonicalRoleKey,
} from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RaisePurchaseRequestPanel } from '@/components/supply-chain/raise-purchase-request-panel'
import { ActivePurchaseOrderPanel } from '@/components/supply-chain/active-purchase-order-panel'
import { PoHistoryPanel } from '@/components/supply-chain/po-history-panel'
import { PoApprovalPanel } from '@/components/supply-chain/po-approval-panel'
import { ClipboardList, FileCheck2, History, ShoppingCart } from 'lucide-react'

const TAB_VALUES = ['purchase', 'orders', 'approvals', 'history'] as const
type PoTab = (typeof TAB_VALUES)[number]

function normalizeTab(
  raw: string | null,
  canApprove: boolean,
): PoTab {
  if (raw === 'purchase' || raw === 'raise') return 'purchase'
  if (raw === 'orders' || raw === 'active') return 'orders'
  if (raw === 'history') return 'history'
  if ((raw === 'approvals' || raw === 'purchase_orders') && canApprove) return 'approvals'
  return 'purchase'
}

export function PurchaseOrdersWorkspace() {
  const mounted = useClientMounted()
  const { name, role } = useAuth()
  const { storeItems, purchaseOrders } = useSupplyChain()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const menuOk = canAccessSupplyPurchaseOrdersMenu(role)
  const canApprove = menuOk && canAccessPoApprovalsTab(role)

  const [activeTab, setActiveTab] = useState<PoTab>(() =>
    normalizeTab(tabParam, canApprove),
  )

  useEffect(() => {
    if (tabParam === 'retirement') {
      window.location.replace('/supply/purchasing?tab=active')
    }
  }, [tabParam])

  useEffect(() => {
    setActiveTab(normalizeTab(tabParam, canApprove))
  }, [tabParam, canApprove])

  const actor = { name: name ?? 'Store', role: canonicalRoleKey(role) ?? 'store' }

  if (!menuOk) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Purchase orders are available to store, purchaser, accountant, manager, administrator,
        superadmin, and auditor roles.
      </div>
    )
  }

  if (!mounted) {
    return <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Purchase orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Raise purchase requests, track active POs, and review approved orders. After manager
          approval, POs appear in History (read-only) until retired at market from Retirement.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PoTab)}
        className="w-full"
      >
        <TabsList className="mx-auto flex h-auto w-full max-w-4xl flex-wrap justify-center gap-1">
          <TabsTrigger value="purchase" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" />
            Raise Purchase Request
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Purchase Orders
          </TabsTrigger>
          {canApprove && (
            <TabsTrigger value="approvals" className="gap-1.5">
              <FileCheck2 className="h-4 w-4" />
              PO Approvals
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchase" className="mt-4">
          <RaisePurchaseRequestPanel activeTab={activeTab} />
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-4">
          <ActivePurchaseOrderPanel actor={actor} storeItems={storeItems} />
        </TabsContent>

        {canApprove && (
          <TabsContent value="approvals" className="mt-4">
            <PoApprovalPanel />
          </TabsContent>
        )}

        <TabsContent value="history" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Purchase orders after accountant and manager approval (read-only). Lines and amounts
            stay as the manager approved — market retirement does not change this view.
          </p>
          <PoHistoryPanel
            purchaseOrders={purchaseOrders}
            forceOrderLines
            emptyMessage="No purchase orders in history yet. After accountant and manager approve, the exact approved PO appears here (read-only)."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
