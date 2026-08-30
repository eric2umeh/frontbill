'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KitchenBatchBuilder } from '@/components/supply-chain/kitchen-batch-builder'
import { KitchenBatchCsvUpload } from '@/components/supply-chain/kitchen-batch-csv-upload'
import { useAuth } from '@/lib/auth-context'
import { canManageKitchenBatchStandards } from '@/lib/permissions'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'

export default function NewKitchenBatchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const duplicateFrom = searchParams.get('duplicateFrom')?.trim() || null
  const { role } = useAuth()
  const { recipes } = useSupplyChain()

  const sourceRecipe = useMemo(
    () => (duplicateFrom ? recipes.find((r) => r.id === duplicateFrom) : undefined),
    [duplicateFrom, recipes],
  )

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
          Back to Kitchen
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            {sourceRecipe ? 'Duplicate batch standard' : 'New batch standard'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {sourceRecipe ? (
              <>
                Copied from <strong className="text-foreground">{sourceRecipe.name}</strong>. Rename
                the batch, adjust ingredients, then save as a new standard.
              </>
            ) : (
              <>
                Define ingredients, overhead, and selling price. Production runs start from All
                Batches.
              </>
            )}
          </p>
        </div>
        <KitchenBatchCsvUpload
          variant="compact"
          onComplete={() => router.push('/supply/kitchen?tab=recipes')}
        />
      </div>

      <KitchenBatchBuilder
        duplicateFromRecipeId={duplicateFrom}
        onSaved={() => router.push('/supply/kitchen?tab=recipes')}
        onCancel={() => router.push('/supply/kitchen?tab=recipes')}
      />
    </div>
  )
}
