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
import { useClientMounted } from '@/hooks/use-client-mounted'

type Props = {
  actor: { name: string; role: string }
  label?: string
  description?: string
  className?: string
}

export function SupplyHistoryClearButton({
  actor,
  label = 'Clear history',
  description = 'Hides the supply activity log on this screen. Purchase orders, issue-out records, and cloud history are not deleted.',
  className,
}: Props) {
  const mounted = useClientMounted()
  const { clearSupplyHistory } = useSupplyChain()

  // Avoid Radix aria-controls id mismatch between SSR and client.
  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className={className} disabled>
        <Trash2 className="h-4 w-4 mr-2" />
        {label}
      </Button>
    )
  }

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
                res.activityCleared
                  ? `Activity log hidden on this screen (${res.activityCleared} ${res.activityCleared === 1 ? 'entry' : 'entries'}). Cloud history is unchanged.`
                  : 'Activity log is already empty on this screen.',
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
