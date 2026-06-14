'use client'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'

type Props = {
  actor: { name: string; role: string }
  label?: string
  description?: string
  className?: string
}

export function SupplyHistoryClearButton({
  actor,
  label = 'Clear history',
  description = 'Removes all purchase order history, issue-out log entries, and supply activity log on this device. Stock and kitchen data are not affected.',
  className,
}: Props) {
  const { clearSupplyHistory } = useSupplyChain()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Trash2 className="h-4 w-4 mr-2" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const res = clearSupplyHistory(actor)
              toast.success(
                `History cleared — ${res.purchaseOrdersCleared} PO(s), ${res.issueOutCleared} issue-out record(s), ${res.activityCleared} activity entry(ies)`,
              )
            }}
          >
            Clear history
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
