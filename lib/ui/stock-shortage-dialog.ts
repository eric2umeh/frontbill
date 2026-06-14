export type StockShortageLine = {
  name: string
  need: number
  onHand: number
  unit: string
}

export type StockShortagePayload = {
  title: string
  message: string
  items: StockShortageLine[]
}

type Listener = (payload: StockShortagePayload | null) => void

let listener: Listener | null = null

export function subscribeStockShortageDialog(next: Listener): () => void {
  listener = next
  return () => {
    if (listener === next) listener = null
  }
}

export function showStockShortageDialog(payload: StockShortagePayload): void {
  listener?.(payload)
}

export function closeStockShortageDialog(): void {
  listener?.(null)
}
