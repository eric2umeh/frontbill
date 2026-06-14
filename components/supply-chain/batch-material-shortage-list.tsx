'use client'

import type { StockShortageLine } from '@/lib/ui/stock-shortage-dialog'

type Props = {
  shortages: StockShortageLine[]
  portions: number
  shortHint?: string
}

export function BatchMaterialShortageList({ shortages, portions, shortHint }: Props) {
  if (portions <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Enter planned portions to preview raw material needs.
      </p>
    )
  }

  if (shortages.length === 0) {
    return (
      <p className="text-xs text-emerald-700 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-2">
        Kitchen raw stock covers all materials for {portions} portion{portions === 1 ? '' : 's'}.
      </p>
    )
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 px-2.5 py-2 space-y-2">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
        {shortages.length} material{shortages.length === 1 ? '' : 's'} short
        {shortHint ? ` — ${shortHint}` : ''}
      </p>
      <ul className="text-xs space-y-1.5 max-h-40 overflow-y-auto">
        {shortages.map((line) => {
          const short = Math.max(0, line.need - line.onHand)
          return (
            <li
              key={`${line.name}-${line.unit}`}
              className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 rounded border bg-background/80 px-2 py-1.5"
            >
              <span className="font-medium">{line.name}</span>
              <span className="text-muted-foreground tabular-nums">
                have {line.onHand} {line.unit} · need {line.need} {line.unit}
              </span>
              <span className="w-full text-destructive font-medium tabular-nums">
                short {short} {line.unit}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
