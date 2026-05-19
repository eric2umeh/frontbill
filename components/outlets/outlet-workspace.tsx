'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { getOutletDepartment, type OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletMenuCategoryRow, OutletMenuItemRow, OutletOrderRow } from '@/lib/outlets/types'
import { LoadingSpinner } from '@/components/loading-screen'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { OutletPos } from '@/components/outlets/outlet-pos'
import { OutletMenuManager } from '@/components/outlets/outlet-menu-manager'
import { OutletOrdersPanel } from '@/components/outlets/outlet-orders-panel'
import { ChevronLeft, ShoppingCart, UtensilsCrossed, ClipboardList, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'

export function OutletWorkspace({ department }: { department: OutletDepartmentKey }) {
  const { organizationId, role } = useAuth()
  const def = getOutletDepartment(department)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<OutletMenuCategoryRow[]>([])
  const [items, setItems] = useState<OutletMenuItemRow[]>([])
  const [orders, setOrders] = useState<OutletOrderRow[]>([])
  const [tab, setTab] = useState('sell')

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
        fetch(`/api/outlets/orders?department=${department}`),
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

  const canMenu = hasPermission(role, 'outlet:menu')
  const canReports = hasPermission(role, 'outlet:reports')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/outlets">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Outlets
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{def.label}</h1>
          <p className="text-sm text-muted-foreground">POS · menu · orders · daily sales</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sell" className="gap-1">
            <ShoppingCart className="h-4 w-4" />
            Take order
          </TabsTrigger>
          {canMenu && (
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
            onSettled={() => void load()}
          />
        </TabsContent>

        {canMenu && (
          <TabsContent value="menu" className="mt-4">
            <OutletMenuManager department={department} categories={categories} items={items} onRefresh={() => void load()} />
          </TabsContent>
        )}

        <TabsContent value="orders" className="mt-4">
          <OutletOrdersPanel orders={orders} />
        </TabsContent>

        {canReports && (
          <TabsContent value="reports" className="mt-4">
            <OutletOrdersPanel orders={orders} />
            <p className="text-xs text-muted-foreground mt-4">
              Charge to room posts to city ledger with the outlet name (e.g. Restaurant) on folio, transactions, and accounts — same as booking add charge.
            </p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
