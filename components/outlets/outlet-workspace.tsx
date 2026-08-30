'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { canManageOutletMenu, canEditOutletMenuPriceAndCategory, canManageOutletOrders } from '@/lib/outlets/access'
import { getOutletDepartment, type OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletMenuCategoryRow, OutletMenuItemRow, OutletOrderRow } from '@/lib/outlets/types'
import { LoadingSpinner } from '@/components/loading-screen'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { OutletPos } from '@/components/outlets/outlet-pos'
import { OutletMenuManager } from '@/components/outlets/outlet-menu-manager'
import { OutletOrdersTabSection } from '@/components/outlets/outlet-orders-tab-section'
import { sortOutletMenuByName } from '@/lib/outlets/sort-outlet-menu'
import { OutletDailyReportPanel } from '@/components/outlets/outlet-daily-report-panel'
import { OutletOrderReceiptDialog, type OutletBillPrintKind } from '@/components/outlets/outlet-order-receipt-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { ChevronLeft, ShoppingCart, UtensilsCrossed, ClipboardList, BarChart3, Package, ChefHat } from 'lucide-react'
import { toast } from 'sonner'
import { RoomInventoryStatsStrip } from '@/components/shared/room-inventory-stats-strip'
import { OutletStoreIssuesPanel } from '@/components/outlets/outlet-store-issues-panel'
import { OutletKitchenItemsPanel } from '@/components/outlets/outlet-kitchen-items-panel'
import { storeIssueDestinationForOutletDepartment } from '@/lib/store/outlet-departments'
import { syncMainBarMenuFromStore } from '@/lib/supply-chain/sync-bar-menu'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'

export function OutletWorkspace({ department }: { department: OutletDepartmentKey }) {
  const { organizationId, role, name: staffName } = useAuth()
  const supply = useSupplyChain()
  const def = getOutletDepartment(department)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<OutletMenuCategoryRow[]>([])
  const [items, setItems] = useState<OutletMenuItemRow[]>([])
  const [ordersRefresh, setOrdersRefresh] = useState(0)
  const canSell = hasPermission(role, 'outlet:sell')
  const canReceipt = hasPermission(role, 'outlet:receipt')
  const canViewMenu = hasPermission(role, 'outlet:view')
  const storeIssueDestination = storeIssueDestinationForOutletDepartment(department)
  const canViewFromStore = storeIssueDestination != null && canViewMenu
  const canViewFromKitchen = department === 'restaurant' && canViewMenu
  const [tab, setTab] = useState(
    canSell
      ? 'sell'
      : canViewFromStore
        ? 'from_store'
        : canViewFromKitchen
          ? 'from_kitchen'
          : canReceipt
            ? 'orders'
            : 'menu',
  )
  const [receiptOrder, setReceiptOrder] = useState<OutletOrderRow | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false)
  const [receiptBillKind, setReceiptBillKind] = useState<OutletBillPrintKind>('auto')
  const mainBarSyncInFlight = useRef(false)

  const fetchMenuRows = useCallback(async () => {
    if (!organizationId) return
    const supabase = createClient()
    if (!supabase) return
    const [{ data: c }, { data: i }] = await Promise.all([
      supabase
        .from('outlet_menu_categories')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('department', department)
        .order('name'),
      supabase
        .from('outlet_menu_items')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('department', department)
        .order('name'),
    ])
    setCategories(sortOutletMenuByName((c as OutletMenuCategoryRow[]) ?? []))
    setItems(sortOutletMenuByName((i as OutletMenuItemRow[]) ?? []))
  }, [organizationId, department])

  const runMainBarStoreSync = useCallback(
    async (opts?: { refreshMenu?: boolean }) => {
      if (department !== 'main_bar' || mainBarSyncInFlight.current) return
      mainBarSyncInFlight.current = true
      try {
        const sync = await syncMainBarMenuFromStore()
        if (!sync.ok) return
        supply.ensureMainBarStockFromCatalog?.()
        if (opts?.refreshMenu !== false && (sync.created > 0 || sync.updated > 0)) {
          await fetchMenuRows()
        }
      } finally {
        mainBarSyncInFlight.current = false
      }
    },
    [department, supply, fetchMenuRows],
  )

  const loadMenu = useCallback(async (opts?: { silent?: boolean; syncFromStore?: boolean }) => {
    if (!organizationId) return
    if (!opts?.silent) setLoading(true)
    try {
      await fetchMenuRows()
    } catch {
      toast.error('Failed to load outlet menu')
    } finally {
      if (!opts?.silent) setLoading(false)
    }

    if (department === 'main_bar' && opts?.syncFromStore === true) {
      void runMainBarStoreSync()
    }
  }, [organizationId, department, fetchMenuRows, runMainBarStoreSync])

  const loadMenuRef = useRef(loadMenu)
  const fetchMenuRowsRef = useRef(fetchMenuRows)
  const runMainBarStoreSyncRef = useRef(runMainBarStoreSync)
  loadMenuRef.current = loadMenu
  fetchMenuRowsRef.current = fetchMenuRows
  runMainBarStoreSyncRef.current = runMainBarStoreSync

  const notifyOrdersChanged = useCallback(() => {
    setOrdersRefresh((n) => n + 1)
  }, [])

  useEffect(() => {
    void loadMenuRef.current({ syncFromStore: department === 'main_bar' })
  }, [department, organizationId])

  useEffect(() => {
    const onCleared = () => {
      void loadMenuRef.current({ silent: true })
    }
    const onSynced = () => {
      if (department === 'restaurant' || department === 'main_bar') {
        void loadMenuRef.current({ silent: true })
      }
    }
    const onSupply = () => {
      if (department === 'main_bar') {
        void runMainBarStoreSyncRef.current().then(() => fetchMenuRowsRef.current())
        return
      }
      void loadMenuRef.current({ silent: true })
    }
    const onBar = () => {
      if (department === 'main_bar') void loadMenuRef.current({ silent: true })
    }
    window.addEventListener('frontbill:outlet-menu-cleared', onCleared)
    window.addEventListener('frontbill:outlet-menu-synced', onSynced)
    window.addEventListener('frontbill:supply-stock-changed', onSupply)
    window.addEventListener('frontbill:bar-stock-changed', onBar)
    return () => {
      window.removeEventListener('frontbill:outlet-menu-cleared', onCleared)
      window.removeEventListener('frontbill:outlet-menu-synced', onSynced)
      window.removeEventListener('frontbill:supply-stock-changed', onSupply)
      window.removeEventListener('frontbill:bar-stock-changed', onBar)
    }
  }, [department])

  if (!def) return null
  if (loading && items.length === 0 && categories.length === 0) return <LoadingSpinner />

  const canManageMenu = canManageOutletMenu(role, department)
  const canEditMenuPricing = canEditOutletMenuPriceAndCategory(role, department)
  const canReports = hasPermission(role, 'outlet:reports')
  const canManageOrders = canManageOutletOrders(role)
  const openReceipt = (
    order: OutletOrderRow,
    autoPrint: boolean,
    billKind: OutletBillPrintKind = 'auto',
  ) => {
    setReceiptOrder(order)
    setReceiptAutoPrint(autoPrint)
    setReceiptBillKind(billKind)
    setReceiptOpen(true)
  }

  return (
    <div className="space-y-2">
      <PageHeader
        title={def.label}
        description={
          department === 'gym'
            ? 'POS · memberships & day passes · stock from Central Store · orders · reports'
            : department === 'laundry'
              ? 'POS · guest laundry tickets · stock from Central Store · orders · reports'
              : department === 'main_bar'
              ? 'POS · drinks by category · stock from Central Store · orders · reports'
              : 'POS · room charge · service fees · open & settled bills · reports'
        }
        backLink={
          <Button variant="ghost" size="sm" asChild className="h-7 px-2 shrink-0">
            <Link href="/outlets">
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
              Outlets
            </Link>
          </Button>
        }
        trailing={<RoomInventoryStatsStrip className="shrink-0 scale-90 origin-right" />}
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-2">
        <TabsList className="h-8 flex-wrap">
          {canSell && (
            <TabsTrigger value="sell" className="gap-1 text-xs h-7 px-2.5">
              <ShoppingCart className="h-3.5 w-3.5" />
              Take order
            </TabsTrigger>
          )}
          {canViewFromStore && (
            <TabsTrigger value="from_store" className="gap-1 text-xs h-7 px-2.5">
              <Package className="h-3.5 w-3.5" />
              Items from Store
            </TabsTrigger>
          )}
          {canViewFromKitchen && (
            <TabsTrigger value="from_kitchen" className="gap-1 text-xs h-7 px-2.5">
              <ChefHat className="h-3.5 w-3.5" />
              Items from Kitchen
            </TabsTrigger>
          )}
          {canViewMenu && (
            <TabsTrigger value="menu" className="gap-1 text-xs h-7 px-2.5">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              Menu
            </TabsTrigger>
          )}
          <TabsTrigger value="orders" className="gap-1 text-xs h-7 px-2.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Orders
          </TabsTrigger>
          {canReports && (
            <TabsTrigger value="reports" className="gap-1 text-xs h-7 px-2.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
          )}
        </TabsList>

        {canSell && (
          <TabsContent value="sell" className="mt-2">
            <OutletPos
              department={department}
              departmentLabel={def.label}
              organizationId={organizationId ?? ''}
              categories={categories}
              items={items}
              canPrintReceipt={canReceipt}
              onSettled={notifyOrdersChanged}
              onOrderBill={(order) => openReceipt(order, true, 'unsettled')}
              onOrderSettled={(order) => openReceipt(order, true, 'settled')}
            />
          </TabsContent>
        )}

        {canViewFromStore && (
          <TabsContent value="from_store" className="mt-2">
            <OutletStoreIssuesPanel destination={storeIssueDestination!} />
          </TabsContent>
        )}

        {canViewFromKitchen && (
          <TabsContent value="from_kitchen" className="mt-2">
            <OutletKitchenItemsPanel />
          </TabsContent>
        )}

        {canViewMenu && (
          <TabsContent value="menu" className="mt-2">
            <OutletMenuManager
              department={department}
              categories={categories}
              items={items}
              canManage={canManageMenu}
              canEditMenuPricing={canEditMenuPricing}
              onRefresh={() => void loadMenu()}
            />
          </TabsContent>
        )}

        <TabsContent value="orders" className="mt-2">
          <OutletOrdersTabSection
            department={department}
            departmentLabel={def.label}
            organizationId={organizationId ?? ''}
            active={tab === 'orders'}
            refreshToken={ordersRefresh}
            staffName={staffName ?? 'Staff'}
            canPrintReceipt={canReceipt}
            canSell={canSell}
            canManageOrders={canManageOrders}
            onPrintUnsettled={(order) => openReceipt(order, false, 'unsettled')}
            onPrintSettled={(order) => openReceipt(order, false, 'settled')}
            onSettled={notifyOrdersChanged}
          />
        </TabsContent>

        {canReports && (
          <TabsContent value="reports" className="mt-2 space-y-4">
            <OutletDailyReportPanel department={department} departmentLabel={def.label} />
            <p className="text-xs text-muted-foreground">
              Charge to room posts to city ledger with the outlet name (e.g. Restaurant) on folio, transactions, and accounts — same as booking add charge. Use the Orders tab for order history and printable sales reports by date.
            </p>
          </TabsContent>
        )}
      </Tabs>

      {canReceipt && (
        <OutletOrderReceiptDialog
          open={receiptOpen}
          onOpenChange={setReceiptOpen}
          order={receiptOrder}
          department={department}
          departmentLabel={def.label}
          organizationId={organizationId ?? ''}
          staffName={staffName}
          autoPrint={receiptAutoPrint}
          billKind={receiptBillKind}
        />
      )}
    </div>
  )
}
