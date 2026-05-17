'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import type { FolioAttachmentSource } from '@/lib/folio/folio-attachment-types'

type Row = {
  id: string
  remarks: string | null
  file_url: string | null
  file_name: string | null
}

type Props = {
  bookingId: string
  userId: string
  source?: FolioAttachmentSource
  sourceId?: string
}

/** Compact list of attachments for approval cards (Night Audit). */
export function FolioAttachmentLinks({ bookingId, userId, source, sourceId }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bookingId || !userId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const q = new URLSearchParams({ caller_id: userId })
        if (source) q.set('source', source)
        if (sourceId) q.set('source_id', sourceId)
        const res = await fetch(`/api/bookings/${bookingId}/attachments?${q}`, { credentials: 'include' })
        const json = await res.json()
        if (!cancelled) setRows(res.ok ? json.attachments || [] : [])
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId, userId, source, sourceId])

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading attachments…
      </p>
    )
  }

  if (!rows.length) return null

  return (
    <div className="space-y-1 text-xs">
      {rows.map((row) => (
        <div key={row.id} className="rounded border bg-muted/40 px-2 py-1.5">
          {row.remarks && <p className="text-muted-foreground whitespace-pre-wrap">{row.remarks}</p>}
          {row.file_url && (
            <a
              href={row.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline mt-0.5"
            >
              <ExternalLink className="h-3 w-3" />
              {row.file_name || 'View attachment'}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
