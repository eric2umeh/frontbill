'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { canManageOutletMenu } from '@/lib/outlets/access'
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
import { ChevronLeft, ShoppingCart, UtensilsCrossed, ClipboardList, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { RoomInventoryStatsStrip } from '@/components/shared/room-inventory-stats-strip'

export function OutletWorkspace({ department }: { department: OutletDepartmentKey }) {
  const { organizationId, role, name: staffName } = useAuth()
  const def = getOutletDepartment(department)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<OutletMenuCategoryRow[]>([])
  const [items, setItems] = useState<OutletMenuItemRow[]>([])
  const [ordersRefresh, setOrdersRefresh] = useState(0)
  const canSell = hasPermission(role, 'outlet:sell')
  const canReceipt = hasPermission(role, 'outlet:receipt')
  const [tab, setTab] = useState(
    canSell ? 'sell' : canReceipt ? 'orders' : 'menu',
  )
  const [receiptOrder, setReceiptOrder] = useState<OutletOrderRow | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false)
  const [receiptBillKind, setReceiptBillKind] = useState<OutletBillPrintKind>('auto')

  const loadMenu = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
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
    } catch {
      toast.error('Failed to load outlet menu')
    } finally {
      setLoading(false)
    }
  }, [organizationId, department])

  const notifyOrdersChanged = useCallback(() => {
    setOrdersRefresh((n) => n + 1)
  }, [])

  useEffect(() => {
    void loadMenu()
  }, [loadMenu])

  if (!def) return null
  if (loading) return <LoadingSpinner />

  const canViewMenu = hasPermission(role, 'outlet:view')
  const canManageMenu = canManageOutletMenu(role)
  const canReports = hasPermission(role, 'outlet:reports')
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
        description="POS · menu · orders · reports"
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

        {canViewMenu && (
          <TabsContent value="menu" className="mt-2">
            <OutletMenuManager
              department={department}
              categories={categories}
              items={items}
              canManage={canManageMenu}
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
            canPrintReceipt={canReceipt}
            canSell={canSell}
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
