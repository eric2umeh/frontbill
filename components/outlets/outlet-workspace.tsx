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
import { OutletOrdersPanel } from '@/components/outlets/outlet-orders-panel'
import { OutletDailyReportPanel } from '@/components/outlets/outlet-daily-report-panel'
import { OutletOrderReceiptDialog } from '@/components/outlets/outlet-order-receipt-dialog'
import { ChevronLeft, ShoppingCart, UtensilsCrossed, ClipboardList, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { RoomInventoryStatsStrip } from '@/components/shared/room-inventory-stats-strip'

export function OutletWorkspace({ department }: { department: OutletDepartmentKey }) {
  const { organizationId, role, name: staffName } = useAuth()
  const def = getOutletDepartment(department)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<OutletMenuCategoryRow[]>([])
  const [items, setItems] = useState<OutletMenuItemRow[]>([])
  const [orders, setOrders] = useState<OutletOrderRow[]>([])
  const [tab, setTab] = useState('sell')
  const [receiptOrder, setReceiptOrder] = useState<OutletOrderRow | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const supabase = createClient()
      if (!supabase) return
      const [{ data: c }, { data: i }, resOrders] = await Promise.all([
        supabase
          .from('outlet_menu_categories')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('department', department)
          .order('sort_order'),
        supabase
          .from('outlet_menu_items')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('department', department)
          .order('sort_order'),
        fetch(`/api/outlets/orders?department=${department}`, {
          headers: await outletApiHeaders(),
          credentials: 'include',
        }),
      ])
      setCategories((c as OutletMenuCategoryRow[]) ?? [])
      setItems((i as OutletMenuItemRow[]) ?? [])
      if (resOrders.ok) {
        const json = await resOrders.json()
        setOrders(json.orders ?? [])
      }
    } catch {
      toast.error('Failed to load outlet data')
    } finally {
      setLoading(false)
    }
  }, [organizationId, department])

  useEffect(() => {
    void load()
  }, [load])

  if (!def) return null
  if (loading) return <LoadingSpinner />

  const canViewMenu = hasPermission(role, 'outlet:view')
  const canManageMenu = canManageOutletMenu(role)
  const canReports = hasPermission(role, 'outlet:reports')
  const canReceipt = hasPermission(role, 'outlet:receipt')

  const openReceipt = (order: OutletOrderRow, autoPrint: boolean) => {
    setReceiptOrder(order)
    setReceiptAutoPrint(autoPrint)
    setReceiptOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" asChild className="shrink-0 mt-0.5">
          <Link href="/outlets">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Outlets
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{def.label}</h1>
            <RoomInventoryStatsStrip className="shrink-0" />
          </div>
          <p className="text-sm text-muted-foreground">POS · menu · orders · daily sales</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sell" className="gap-1">
            <ShoppingCart className="h-4 w-4" />
            Take order
          </TabsTrigger>
          {canViewMenu && (
            <TabsTrigger value="menu" className="gap-1">
              <UtensilsCrossed className="h-4 w-4" />
              Menu
            </TabsTrigger>
          )}
          <TabsTrigger value="orders" className="gap-1">
            <ClipboardList className="h-4 w-4" />
            Orders
          </TabsTrigger>
          {canReports && (
            <TabsTrigger value="reports" className="gap-1">
              <BarChart3 className="h-4 w-4" />
              Reports
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sell" className="mt-4">
          <OutletPos
            department={department}
            departmentLabel={def.label}
            organizationId={organizationId ?? ''}
            categories={categories}
            items={items}
            canPrintReceipt={canReceipt}
            onSettled={() => void load()}
            onOrderSettled={(order) => openReceipt(order, true)}
          />
        </TabsContent>

        {canViewMenu && (
          <TabsContent value="menu" className="mt-4">
            <OutletMenuManager
              department={department}
              categories={categories}
              items={items}
              canManage={canManageMenu}
              onRefresh={() => void load()}
            />
          </TabsContent>
        )}

        <TabsContent value="orders" className="mt-4">
          <OutletOrdersPanel
            orders={orders}
            canPrintReceipt={canReceipt}
            onPrintReceipt={(order) => openReceipt(order, false)}
          />
        </TabsContent>

        {canReports && (
          <TabsContent value="reports" className="mt-4 space-y-6">
            <OutletDailyReportPanel department={department} departmentLabel={def.label} />
            <div>
              <h3 className="text-sm font-semibold mb-3">Recent orders</h3>
              <OutletOrdersPanel orders={orders} />
            </div>
            <p className="text-xs text-muted-foreground">
              Charge to room posts to city ledger with the outlet name (e.g. Restaurant) on folio, transactions, and accounts — same as booking add charge.
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
        />
      )}
    </div>
  )
}
