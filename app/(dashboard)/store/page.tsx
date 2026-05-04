'use client'

import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { StoreManager } from '@/components/store/store-manager'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function StorePage() {
  const { role } = useAuth()
  if (!hasPermission(role, 'store:view')) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Store</CardTitle>
          <CardDescription>You don&apos;t have permission to view the hotel store.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    )
  }

  return <StoreManager />
}
