'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { useSupplyPoPendingCounts } from '@/hooks/use-expenses-pending-counts'
import {
  canAccessPoApprovalsTab,
  canAccessSupplyPurchaseOrdersMenu,
  canRaisePurchaseRequest,
  canonicalRoleKey,
} from '@/lib/permissions'
import { isPurchaseOrderInPoMenuHistory } from '@/lib/supply-chain/po-format'
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
  canRaise: boolean,
): PoTab {
  if ((raw === 'purchase' || raw === 'raise') && canRaise) return 'purchase'
  if (raw === 'orders' || raw === 'active') return 'orders'
  if (raw === 'history') return 'history'
  if ((raw === 'approvals' || raw === 'purchase_orders') && canApprove) return 'approvals'
  if (canRaise) return 'purchase'
  if (canApprove) return 'approvals'
  return 'orders'
}

export function PurchaseOrdersWorkspace() {
  const mounted = useClientMounted()
  const { name, role } = useAuth()
  const { storeItems, purchaseOrders } = useSupplyChain()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')

  const menuOk = canAccessSupplyPurchaseOrdersMenu(role)
  const canApprove = menuOk && canAccessPoApprovalsTab(role)
  const canRaise = menuOk && canRaisePurchaseRequest(role)

  const [activeTab, setActiveTab] = useState<PoTab>(() =>
    normalizeTab(tabParam, canApprove, canRaise),
  )

  useEffect(() => {
    if (tabParam === 'retirement') {
      window.location.replace('/supply/purchasing?tab=retirement')
    }
  }, [tabParam])

  useEffect(() => {
    setActiveTab(normalizeTab(tabParam, canApprove, canRaise))
  }, [tabParam, canApprove, canRaise])

  const actor = { name: name ?? 'Store', role: canonicalRoleKey(role) ?? 'store' }

  const historyCount = useMemo(
    () => purchaseOrders.filter((p) => isPurchaseOrderInPoMenuHistory(p)).length,
    [purchaseOrders],
  )
  const pendingCounts = useSupplyPoPendingCounts(role)
  const pendingApprovalsCount = pendingCounts.purchaseOrders

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
          {canRaise
            ? 'Raise purchase requests, track active POs, and review approved orders. After manager approval, POs appear in History immediately (read-only) and stay there permanently.'
            : 'View purchase orders and approved PO history (read-only). Auditors cannot raise or change purchase requests.'}
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as PoTab)}
        className="w-full"
      >
        <TabsList className="mx-auto flex h-auto w-full max-w-4xl flex-wrap justify-center gap-1">
          {canRaise && (
            <TabsTrigger value="purchase" className="gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Raise Purchase Request
            </TabsTrigger>
          )}
          <TabsTrigger value="orders" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Purchase Orders
          </TabsTrigger>
          {canApprove && (
            <TabsTrigger value="approvals" className="gap-1.5">
              <FileCheck2 className="h-4 w-4" />
              PO Approvals
              {pendingApprovalsCount > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                  {pendingApprovalsCount}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            History
            {historyCount > 0 && (
              <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary tabular-nums">
                {historyCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {canRaise && (
          <TabsContent value="purchase" className="mt-4">
            <RaisePurchaseRequestPanel activeTab={activeTab} />
          </TabsContent>
        )}

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
            Manager-approved purchase orders appear here immediately and stay permanently
            (read-only). Lines and amounts stay exactly as approved — market retirement does
            not change this view.
          </p>
          <PoHistoryPanel
            purchaseOrders={purchaseOrders}
            forceOrderLines
            emptyMessage="No purchase orders in history yet. After manager approval, the exact approved PO appears here immediately (read-only)."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
