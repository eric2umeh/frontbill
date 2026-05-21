'use client'

import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { EventsPanel } from '@/components/events/events-panel'

export default function EventsPage() {
  const { role } = useAuth()

  if (!hasPermission(role, 'events:view')) {
    return (
      <p className="text-muted-foreground py-8">You do not have permission to view events.</p>
    )
  }

  return <EventsPanel />
}
