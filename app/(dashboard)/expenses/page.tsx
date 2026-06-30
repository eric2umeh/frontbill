'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { canAccessExpenseMenu, hasPermission } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExpenseLedger } from '@/components/expenses/expense-ledger'
import { ExpenseCategoriesManager } from '@/components/expenses/expense-categories-manager'
import { ExpenseImportDialog } from '@/components/expenses/expense-import-dialog'
import { ExpenseBudgetsPanel } from '@/components/expenses/expense-budgets-panel'
import { Upload, Receipt, Tags, Target, ShoppingCart, ClipboardCheck } from 'lucide-react'
import { PoApprovalPanel } from '@/components/supply-chain/po-approval-panel'
import { PoRetirementPanel } from '@/components/supply-chain/po-retirement-panel'
import {
  canAdminTestApproveSupplyPo,
  canSupplyPoAccountantReview,
  canSupplyPoManagerReview,
  canSupplyRetirementReview,
} from '@/lib/permissions'

export default function ExpensesPage() {
  const { userId, role } = useAuth()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [importOpen, setImportOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState('expenses')

  const canView = canAccessExpenseMenu(role) && hasPermission(role, 'expenses:view')
  const canAdd = hasPermission(role, 'expenses:create')
  const canModify =
    hasPermission(role, 'expenses:create') || hasPermission(role, 'expenses:edit')
  const canDelete = hasPermission(role, 'expenses:edit')
  const canManageCategories = hasPermission(role, 'expenses:edit')
  const canImport = hasPermission(role, 'expenses:export')
  const canBudget = hasPermission(role, 'expenses:budget')
  const canPurchaseOrders =
    canSupplyPoAccountantReview(role) ||
    canSupplyPoManagerReview(role) ||
    canAdminTestApproveSupplyPo(role)
  const canRetirement = canSupplyRetirementReview(role)

  useEffect(() => {
    if (tabParam === 'purchase_orders' && canPurchaseOrders) {
      setActiveTab('purchase_orders')
    }
    if (tabParam === 'retirement' && canRetirement) {
      setActiveTab('retirement')
    }
  }, [tabParam, canPurchaseOrders, canRetirement])

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Operating expenses are only available to Accountant, Manager, Administrator, and Superadmin roles.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Operating expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record each expense as a line with category, amount, and reference. Totals feed Reports → Monthly P&amp;L
            and Daily expenditure.
          </p>
        </div>
        {canImport && userId && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Excel
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="expenses" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            Expenses
          </TabsTrigger>
          {canPurchaseOrders && (
            <TabsTrigger value="purchase_orders" className="gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Purchase orders
            </TabsTrigger>
          )}
          {canRetirement && (
            <TabsTrigger value="retirement" className="gap-1.5">
              <ClipboardCheck className="h-4 w-4" />
              Retirement
            </TabsTrigger>
          )}
          <TabsTrigger value="categories" className="gap-1.5">
            <Tags className="h-4 w-4" />
            Categories
          </TabsTrigger>
          {canBudget && (
            <TabsTrigger value="budgets" className="gap-1.5">
              <Target className="h-4 w-4" />
              Budgets
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="expenses" className="mt-4">
          {userId ? (
            <ExpenseLedger
              key={refreshKey}
              userId={userId}
              canAdd={canAdd}
              canModify={canModify}
              canDelete={canDelete}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sign in to record expenses.</p>
          )}
        </TabsContent>

        {canPurchaseOrders && (
          <TabsContent value="purchase_orders" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Store purchase orders</CardTitle>
                <CardDescription>
                  Accountant accepts or rejects raised POs, then manager / admin approves for market purchase.
                  Store staff send POs from Supply chain → Central store.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PoApprovalPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canRetirement && (
          <TabsContent value="retirement" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Market retirements</CardTitle>
                <CardDescription>
                  Review retirements submitted from Purchasing after market purchase. Rejected
                  retirements return to the purchaser to edit and resubmit.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PoRetirementPanel />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Expense categories</CardTitle>
              <CardDescription>
                Add or edit categories used when recording expenses. Run migrations 044 and 045 in Supabase before first
                use.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? (
                <ExpenseCategoriesManager userId={userId} canManage={canManageCategories} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to manage categories.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canBudget && (
          <TabsContent value="budgets" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Monthly budgets</CardTitle>
                <CardDescription>Alerts when spend reaches 90% of a category limit on Monthly P&amp;L.</CardDescription>
              </CardHeader>
              <CardContent>{userId && <ExpenseBudgetsPanel userId={userId} />}</CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {userId && (
        <ExpenseImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          userId={userId}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
