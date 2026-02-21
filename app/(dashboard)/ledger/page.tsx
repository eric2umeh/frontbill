'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'
import { AlertCircle, Building2 } from 'lucide-react'

// Mock data
const mockOrganizations: any[] = []
const mockLedgerEntries: any[] = []

export default function CityLedgerPage() {
  const organizations = mockOrganizations
  const ledgerEntries = mockLedgerEntries
  
  const totalOutstanding = organizations.reduce((sum, org) => sum + Number(org.outstanding_balance), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">City Ledger</h1>
        <p className="text-muted-foreground">
          Track organizational debts and credit accounts
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Total Outstanding
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">{formatNaira(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Active Accounts</div>
            <div className="text-2xl font-bold mt-2">{organizations?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Recent Transactions</div>
            <div className="text-2xl font-bold mt-2">{ledgerEntries?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Outstanding Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {organizations.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No outstanding balances
                </p>
              ) : (
                organizations.map((org) => (
                  <div key={org.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <Badge variant="secondary" className="mt-1 capitalize">
                        {org.type}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{formatNaira(org.outstanding_balance)}</p>
                      <p className="text-xs text-muted-foreground">
                        Limit: {formatNaira(org.credit_limit)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {ledgerEntries.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No transactions yet
                </p>
              ) : (
                ledgerEntries.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{entry.organization?.name}</p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(entry.transaction_date).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${
                        entry.transaction_type === 'payment' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {entry.transaction_type === 'payment' ? '+' : '-'}{formatNaira(entry.amount)}
                      </p>
                      <Badge variant="secondary" className="mt-1 capitalize">
                        {entry.transaction_type}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
