'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, ExternalLink, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { FOLIO_ATTACHMENT_SOURCE_LABELS, type FolioAttachmentSource } from '@/lib/folio/folio-attachment-types'
import {
  FolioRemarksAttachmentsField,
  type FolioRemarksAttachmentsValue,
} from '@/components/folio/folio-remarks-attachments-field'
import { useAuth } from '@/lib/auth-context'

export type FolioAttachmentRow = {
  id: string
  source: FolioAttachmentSource
  remarks: string | null
  file_url: string | null
  file_name: string | null
  created_at: string
  created_by_name?: string | null
}

type Props = {
  bookingId: string
  canAdd?: boolean
}

const emptyExtras: FolioRemarksAttachmentsValue = { remarks: '', files: [] }

export function FolioAttachmentsPanel({ bookingId, canAdd = true }: Props) {
  const { userId } = useAuth()
  const [rows, setRows] = useState<FolioAttachmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [extras, setExtras] = useState<FolioRemarksAttachmentsValue>(emptyExtras)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!bookingId || !userId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/bookings/${bookingId}/attachments?caller_id=${userId}`,
        { credentials: 'include' },
      )
      const json = await res.json()
      if (!res.ok) {
        setRows([])
        return
      }
      setRows(json.attachments || [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [bookingId, userId])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async () => {
    if (!userId || (!extras.remarks.trim() && extras.files.length === 0)) {
      toast.error('Add a remark or at least one file')
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('caller_id', userId)
      fd.append('remarks', extras.remarks.trim())
      extras.files.forEach((f) => fd.append('files', f))

      const res = await fetch(`/api/bookings/${bookingId}/attachments`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to save')
        return
      }
      toast.success('Attachment saved')
      setExtras(emptyExtras)
      await load()
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          Remarks & attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No remarks or files on this folio yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{FOLIO_ATTACHMENT_SOURCE_LABELS[row.source] || row.source}</span>
                  <span>·</span>
                  <span>{format(new Date(row.created_at), 'dd MMM yyyy HH:mm')}</span>
                  {row.created_by_name && (
                    <>
                      <span>·</span>
                      <span>{row.created_by_name}</span>
                    </>
                  )}
                </div>
                {row.remarks && <p className="whitespace-pre-wrap">{row.remarks}</p>}
                {row.file_url && (
                  <a
                    href={row.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {row.file_name || 'View file'}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdd && userId && (
          <div className="space-y-3 pt-2 border-t">
            <FolioRemarksAttachmentsField
              value={extras}
              onChange={setExtras}
              disabled={saving}
              compact
              remarksPlaceholder="Add a note or upload for this folio…"
            />
            <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save remark / file'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
