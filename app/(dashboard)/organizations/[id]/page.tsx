'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, CreditCard, TrendingUp, TrendingDown } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'

export default function OrganizationDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('transactions')

  // Mock organization data
  const organization = {
    id: params.id,
    name: 'Federal Ministry of Health',
    type: 'government',
    contactPerson: 'Dr. Adewale Johnson',
    email: 'adewale@health.gov.ng',
    phone: '+234 803 456 7890',
    balance: -450000,
    totalDebt: 450000,
    totalCredit: 0,
  }

  // Mock transaction history
  const transactions = [
    { id: '1', date: '2024-01-20', description: 'Room 305 - 3 nights', guestName: 'Mr. Ibrahim Musa', amount: 150000, type: 'charge' },
    { id: '2', date: '2024-01-18', description: 'Payment received', amount: -100000, type: 'payment', method: 'Transfer' },
    { id: '3', date: '2024-01-15', description: 'Room 205 - 2 nights', guestName: 'Mrs. Amina Hassan', amount: 100000, type: 'charge' },
    { id: '4', date: '2024-01-12', description: 'Room 405 - 4 nights', guestName: 'Dr. Chinedu Okafor', amount: 200000, type: 'charge' },
    { id: '5', date: '2024-01-10', description: 'Payment received', amount: -150000, type: 'payment', method: 'Cash' },
    { id: '6', date: '2024-01-08', description: 'Room 105 - 1 night', guestName: 'Miss Kemi Adebayo', amount: 50000, type: 'charge' },
  ]

  // Mock guest history
  const guests = [
    { id: '1', name: 'Mr. Ibrahim Musa', room: '305', checkIn: '2024-01-20', checkOut: '2024-01-23', amount: 150000, status: 'checked_out' },
    { id: '2', name: 'Mrs. Amina Hassan', room: '205', checkIn: '2024-01-15', checkOut: '2024-01-17', amount: 100000, status: 'checked_out' },
    { id: '3', name: 'Dr. Chinedu Okafor', room: '405', checkIn: '2024-01-12', checkOut: '2024-01-16', amount: 200000, status: 'checked_out' },
    { id: '4', name: 'Miss Kemi Adebayo', room: '105', checkIn: '2024-01-08', checkOut: '2024-01-09', amount: 50000, status: 'checked_out' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Organizations
        </Button>
      </div>

      {/* Credit Card Style Balance Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm opacity-90">{organization.name}</p>
              <p className="text-4xl font-bold tracking-tight">
                {organization.balance < 0 ? '-' : '+'}{formatNaira(Math.abs(organization.balance))}
              </p>
              <div className="flex items-center gap-2 text-sm opacity-90">
                {organization.balance < 0 ? (
                  <>
                    <TrendingDown className="h-4 w-4" />
                    <span>Outstanding Debt</span>
                  </>
                ) : organization.balance > 0 ? (
                  <>
                    <TrendingUp className="h-4 w-4" />
                    <span>Available Credit</span>
                  </>
                ) : (
                  <span>Balance Cleared</span>
                )}
              </div>
            </div>
            <div className="rounded-full bg-primary-foreground/20 p-3">
              <CreditCard className="h-8 w-8" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-primary-foreground/20">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="opacity-75">Contact</p>
                <p className="font-semibold">{organization.contactPerson}</p>
              </div>
              <div>
                <p className="opacity-75">Type</p>
                <p className="font-semibold uppercase">{organization.type}</p>
              </div>
              <div>
                <p className="opacity-75">Email</p>
                <p className="font-semibold text-xs">{organization.email}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Transactions and Guests */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="transactions">Transaction History</TabsTrigger>
          <TabsTrigger value="guests">Guest History</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transactions.map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{txn.description}</div>
                      {txn.guestName && (
                        <div className="text-sm text-muted-foreground">{txn.guestName}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {new Date(txn.date).toLocaleDateString('en-GB')}
                        {txn.method && ` · ${txn.method}`}
                      </div>
                    </div>
                    <div className={`font-semibold ${txn.type === 'payment' ? 'text-green-600' : 'text-red-600'}`}>
                      {txn.type === 'payment' ? '' : '+'}{formatNaira(txn.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Guest History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {guests.map((guest) => (
                  <div key={guest.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{guest.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Room {guest.room} · {new Date(guest.checkIn).toLocaleDateString('en-GB')} - {new Date(guest.checkOut).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatNaira(guest.amount)}</div>
                      <Badge variant="outline" className="mt-1 bg-gray-500/10 text-gray-700">
                        {guest.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
