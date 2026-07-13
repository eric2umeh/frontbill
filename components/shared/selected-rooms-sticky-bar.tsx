'use client'

import { cn } from '@/lib/utils'

type Props = {
  roomNumbers: Array<string | number>
  className?: string
}

/** Pinned under modal header so selected rooms stay visible while scrolling to payment. */
export function SelectedRoomsStickyBar({ roomNumbers, className }: Props) {
  if (roomNumbers.length === 0) return null

  const nums = roomNumbers.map((n) => String(n).trim()).filter(Boolean)
  if (nums.length === 0) return null

  const summary =
    nums.length === 1
      ? `Room ${nums[0]}`
      : `${nums.length} rooms — ${nums.join(', ')}`

  return (
    <div
      className={cn(
        'shrink-0 border-b bg-muted/60 px-6 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <span className="font-medium text-foreground">Selected rooms: </span>
      {summary}
    </div>
  )
}
