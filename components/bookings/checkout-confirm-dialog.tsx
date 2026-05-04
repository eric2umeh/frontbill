'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'

export type CheckoutConfirmDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  /** Body under the icon / title column */
  description?: React.ReactNode
  /** Shown when &gt; 0 */
  outstandingAmount?: number | null
  outstandingLabel?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  onConfirm: () => Promise<void>
}

/**
 * Checkout confirmation — dimmed blurred backdrop blocks the rest of the app until Cancel or Confirm.
 */
export function CheckoutConfirmDialog({
  open,
  onClose,
  title,
  description,
  outstandingAmount,
  outstandingLabel = 'Outstanding balance:',
  confirmLabel = 'Confirm checkout',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
}: CheckoutConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) return
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="gap-4 border border-amber-200/80 bg-card p-6 shadow-2xl ring-1 ring-black/10 sm:max-w-md dark:border-amber-900/50 dark:bg-zinc-950 dark:ring-white/10"
      >
        <DialogHeader className="space-y-3 text-left sm:text-left">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/80">
              <LogOut className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="text-xl leading-tight">{title}</DialogTitle>
              <div className="text-sm text-muted-foreground [&_p+p]:mt-2">{description}</div>
              {outstandingAmount != null && outstandingAmount > 0 && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {outstandingLabel} {formatNaira(outstandingAmount)}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={() => !loading && onClose()}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            disabled={loading}
            className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
            onClick={async () => {
              await onConfirm()
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
