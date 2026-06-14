'use client'

import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KitchenBatchBuilder } from '@/components/supply-chain/kitchen-batch-builder'

export default function EditKitchenBatchPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params.id ?? '')

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
