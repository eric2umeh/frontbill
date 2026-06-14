import { toast } from 'sonner'
import {
  showStockShortageDialog,
  type StockShortageLine,
} from '@/lib/ui/stock-shortage-dialog'

export type SupplyActionError = {
  error: string
  shortages?: StockShortageLine[]
}

export function isSupplyActionError(
  res: unknown,
): res is SupplyActionError {
  return (
    typeof res === 'object' &&
    res != null &&
    'error' in res &&
    typeof (res as SupplyActionError).error === 'string'
  )
}

export function handleSupplyActionError(
  res: SupplyActionError,
  options?: { title?: string; fallbackMessage?: string },
): void {
  if (res.shortages?.length) {
    showStockShortageDialog({
      title: options?.title ?? 'Not enough stock',
      message:
        options?.fallbackMessage ??
        res.error ??
        'The following items are short. Issue from store or adjust quantities, then try again.',
      items: res.shortages,
    })
    return
  }
  toast.error(res.error)
}
