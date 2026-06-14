'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { departmentsForRole } from '@/lib/outlets/access'
import { OUTLET_DEPARTMENTS } from '@/lib/outlets/departments'
import { hasPermission } from '@/lib/permissions'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Utensils,
  Wine,
  Waves,
  PartyPopper,
  Shirt,
  Dumbbell,
  ChevronRight,
  BedDouble,
  Receipt,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  wine: Wine,
  waves: Waves,
  party: PartyPopper,
  shirt: Shirt,
  dumbbell: Dumbbell,
}

const OUTLET_FEATURES = [
  'Room number → guest name lookup',
  'Room service · dine-in · take-away · walk-in',
  'Service fees · open bills · settle with POS / cash / transfer / room charge',
]

export default function OutletsHubPage() {
  const { role } = useAuth()
  if (!hasPermission(role, 'outlet:view')) {
    return <p className="text-muted-foreground p-6">You do not have access to outlets.</p>
  }

  const allowed = departmentsForRole(role)
  const cards = OUTLET_DEPARTMENTS.filter((d) => allowed.includes(d.key))

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outlets &amp; Services</h1>
        <p className="text-muted-foreground mt-1">
          Restaurant, bars, pool bar, banquets, laundry, and gym — full POS with receipts, folio
          posting, and daily outlet reports.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1.5 flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Each outlet includes
        </p>
        <ul className="list-disc pl-5 space-y-0.5">
          {OUTLET_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((d) => {
          const Icon = ICONS[d.icon] ?? Utensils
          return (
            <Link key={d.key} href={`/outlets/${d.key}`}>
              <Card className="hover:border-amber-300 hover:shadow-md transition h-full">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{d.label}</CardTitle>
                    {d.key === 'gym' && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        Membership plans in Menu tab
                      </Badge>
                    )}
                    {d.key === 'pool_bar' && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        Pool-side bar &amp; snacks
                      </Badge>
                    )}
                  </div>
                  <Icon className="h-5 w-5 text-amber-700 shrink-0" />
                </CardHeader>
                <CardDescription className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <BedDouble className="h-3.5 w-3.5" />
                    Open POS
                  </span>
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
