'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KitchenBatchBuilder } from '@/components/supply-chain/kitchen-batch-builder'

export default function NewKitchenBatchPage() {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2 -ml-2" asChild>
        <Link href="/supply/kitchen">
          <ArrowLeft className="h-4 w-4" />
          Back to Kitchen
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">New batch standard</h1>
          <p className="text-sm text-muted-foreground">
            Define ingredients, overhead, and selling price. Production runs start from All Batches.
          </p>
        </div>
      </div>

      <KitchenBatchBuilder
        onSaved={() => router.push('/supply/kitchen?tab=recipes')}
        onCancel={() => router.push('/supply/kitchen')}
      />
    </div>
  )
}
