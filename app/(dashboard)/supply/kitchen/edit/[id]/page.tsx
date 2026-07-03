'use client'

import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KitchenBatchBuilder } from '@/components/supply-chain/kitchen-batch-builder'
import { useAuth } from '@/lib/auth-context'
import { canManageKitchenBatchStandards } from '@/lib/permissions'

export default function EditKitchenBatchPage() {
  const router = useRouter()
  const params = useParams()
  const { role } = useAuth()
  const id = String(params.id ?? '')

  useEffect(() => {
    if (!canManageKitchenBatchStandards(role)) {
      router.replace('/supply/kitchen')
    }
  }, [role, router])

  if (!canManageKitchenBatchStandards(role)) return null

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" asChild>
        <Link href="/supply/kitchen?tab=recipes">
          <ArrowLeft className="h-4 w-4" />
          Back to All Batches
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold">Edit batch standard</h1>
        <p className="text-sm text-muted-foreground">
          Update ingredients, overhead, and outlet listing.
        </p>
      </div>
      {id ? (
        <KitchenBatchBuilder
          editRecipeId={id}
          onSaved={() => router.push('/supply/kitchen?tab=recipes')}
          onCancel={() => router.push('/supply/kitchen?tab=recipes')}
        />
      ) : null}
    </div>
  )
}
