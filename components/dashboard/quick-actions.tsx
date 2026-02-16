'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserPlus, Calendar, CreditCard, FileText } from 'lucide-react'

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link href="/guests?action=new">
            <UserPlus className="h-5 w-5" />
            <span className="text-xs">Check In Guest</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link href="/bookings?action=new">
            <Calendar className="h-5 w-5" />
            <span className="text-xs">New Booking</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link href="/payments?action=new">
            <CreditCard className="h-5 w-5" />
            <span className="text-xs">Record Payment</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link href="/reports">
            <FileText className="h-5 w-5" />
            <span className="text-xs">View Reports</span>
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
