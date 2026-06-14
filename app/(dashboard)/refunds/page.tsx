'use client'

import { useAuth } from '@/lib/auth-context'
import { RefundsPanel } from '@/components/reports/financial-and-refund-panels'
import { hasPermission } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function RefundsPage() {
  const { userId, organizationId, role } = useAuth()
  const router = useRouter()
  const canRefund = hasPermission(role, 'payments:refund')

  useEffect(() => {
    if (role && !canRefund) router.replace('/dashboard')
  }, [role, canRefund, router])

  if (!userId || !organizationId || !canRefund) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Record guest refunds and credits — separate from full reports.
        </p>
      </div>
      <RefundsPanel userId={userId} organizationId={organizationId} />
    </div>
  )
}
