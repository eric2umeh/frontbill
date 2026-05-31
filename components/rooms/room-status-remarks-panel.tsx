'use client'

import { format, parseISO } from 'date-fns'
import type { RoomStatusRemark } from '@/lib/rooms/room-status-remarks'
import { Loader2 } from 'lucide-react'

type Props = {
  remarks: RoomStatusRemark[]
  loading?: boolean
}

export function RoomStatusRemarksPanel({ remarks, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading prior remarks…
      </div>
    )
  }

  if (remarks.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5">
      <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
        Prior remarks (confirm the issue is resolved before clearing)
      </p>
      <ul className="space-y-2">
        {remarks.map((remark, index) => (
          <li key={`${remark.source}-${remark.createdAt}-${index}`} className="text-xs">
            <p className="font-medium text-foreground">{remark.title}</p>
            <p className="text-muted-foreground whitespace-pre-wrap">{remark.text}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {remark.createdBy ? `${remark.createdBy} · ` : ''}
              {format(parseISO(remark.createdAt), 'MMM d, yyyy h:mm a')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
