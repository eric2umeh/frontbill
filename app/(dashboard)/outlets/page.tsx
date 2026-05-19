'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { departmentsForRole } from '@/lib/outlets/access'
import { OUTLET_DEPARTMENTS } from '@/lib/outlets/departments'
import { hasPermission } from '@/lib/permissions'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Utensils, Wine, Waves, PartyPopper, Shirt, Dumbbell, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  wine: Wine,
  waves: Waves,
  party: PartyPopper,
  shirt: Shirt,
  dumbbell: Dumbbell,
}

export default function OutletsHubPage() {
  const { role } = useAuth()
  if (!hasPermission(role, 'outlet:view')) {
    return (
      <p className="text-muted-foreground p-6">You do not have access to outlets.</p>
    )
  }

  const allowed = departmentsForRole(role)
  const cards = OUTLET_DEPARTMENTS.filter((d) => allowed.includes(d.key))

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Food, Beverage &amp; Services</h1>
        <p className="text-muted-foreground mt-1">
          Restaurant, bars, banquets, laundry, and gym — take orders, manage menus, receipts, and daily outlet
          reports.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((d) => {
          const Icon = ICONS[d.icon] ?? Utensils
          return (
            <Link key={d.key} href={`/outlets/${d.key}`}>
              <Card className="hover:border-amber-300 hover:shadow-md transition h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg">{d.label}</CardTitle>
                  <Icon className="h-5 w-5 text-amber-700" />
                </CardHeader>
                <CardDescription className="flex items-center justify-between">
                  <span>Open POS &amp; menu</span>
                  <ChevronRight className="h-4 w-4" />
                </CardDescription>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
