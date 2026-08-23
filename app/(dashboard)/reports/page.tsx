'use client'

import { useAuth } from '@/lib/auth-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import {
  FileBarChart,
  BedDouble,
  Building2,
  Wallet,
  PieChart,
  TrendingDown,
  Scale,
} from 'lucide-react'
import { DailyExpenditurePanel } from '@/components/reports/daily-expenditure-panel'
import { MonthlyPlPanel } from '@/components/reports/monthly-pl-panel'
import {
  DailyRevenueAccrualPanel,
  OccupancyRangePanel,
  SalesCollectionPanel,
  AccountantChargeSummaryPanel,
} from '@/components/reports/financial-and-refund-panels'
import { DebtReportPanel } from '@/components/reports/debt-report-panel'

export default function ReportsPage() {
  const { organizationId, userId } = useAuth()

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <Tabs defaultValue="revenue" className="w-full space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight shrink-0">Reports</h1>
          <TabsList className="flex flex-wrap h-auto gap-1 justify-start lg:justify-end">
            <TabsTrigger value="revenue" className="gap-1.5 text-xs sm:text-sm">
              <FileBarChart className="h-4 w-4" />
              Daily revenue
            </TabsTrigger>
            <TabsTrigger value="sales-collection" className="gap-1.5 text-xs sm:text-sm">
              <Wallet className="h-4 w-4" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              Debt
            </TabsTrigger>
            <TabsTrigger value="accountant-charges" className="gap-1.5 text-xs sm:text-sm">
              <PieChart className="h-4 w-4" />
              Charge summary
            </TabsTrigger>
            <TabsTrigger value="occupancy" className="gap-1.5 text-xs sm:text-sm">
              <BedDouble className="h-4 w-4" />
              Occupancy
            </TabsTrigger>
            <TabsTrigger value="daily-expenditure" className="gap-1.5 text-xs sm:text-sm">
              <TrendingDown className="h-4 w-4" />
              Expenditure
            </TabsTrigger>
            <TabsTrigger value="monthly-pl" className="gap-1.5 text-xs sm:text-sm">
              <Scale className="h-4 w-4" />
              Monthly P&amp;L
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="revenue" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              {userId ? (
                <DailyRevenueAccrualPanel userId={userId} organizationId={organizationId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load reports.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales-collection" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              {userId && organizationId ? (
                <SalesCollectionPanel userId={userId} organizationId={organizationId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              <DebtReportPanel organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accountant-charges" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              {userId ? (
                <AccountantChargeSummaryPanel userId={userId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="occupancy" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              {userId ? (
                <OccupancyRangePanel userId={userId} organizationId={organizationId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily-expenditure" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              {userId ? (
                <DailyExpenditurePanel userId={userId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly-pl" className="mt-0">
          <Card>
            <CardContent className="pt-6">
              {userId ? <MonthlyPlPanel userId={userId} /> : <p className="text-sm text-muted-foreground">Sign in.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
