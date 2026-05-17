import type { SupabaseClient } from '@supabase/supabase-js'
import type { FolioAttachmentSource } from '@/lib/folio/folio-attachment-types'
import { uploadFolioAttachmentFile } from '@/lib/folio/folio-attachment-upload'

export type PersistFolioAttachmentsInput = {
  organizationId: string
  bookingId: string
  source: FolioAttachmentSource
  sourceId?: string | null
  remarks?: string | null
  files?: File[]
  createdBy?: string | null
}

/** Upload files (if any) and insert folio_attachments row(s). Non-fatal partial failures return first error message. */
export async function persistFolioAttachments(
  supabase: SupabaseClient,
  input: PersistFolioAttachmentsInput,
): Promise<{ ok: boolean; error: string | null }> {
  const remarks = input.remarks?.trim() || ''
  const files = input.files?.filter(Boolean) || []

  if (!remarks && files.length === 0) {
    return { ok: true, error: null }
  }

  const rows: Record<string, unknown>[] = []

  if (remarks) {
    rows.push({
      organization_id: input.organizationId,
      booking_id: input.bookingId,
      source: input.source,
      source_id: input.sourceId || null,
      remarks,
      created_by: input.createdBy || null,
    })
  }

  for (const file of files) {
    const { publicUrl, error: upErr } = await uploadFolioAttachmentFile(supabase, file, {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      source: input.source,
    })
    if (upErr || !publicUrl) {
      return { ok: false, error: upErr || 'Upload failed' }
    }
    rows.push({
      organization_id: input.organizationId,
      booking_id: input.bookingId,
      source: input.source,
      source_id: input.sourceId || null,
      file_url: publicUrl,
      file_name: file.name,
      content_type: file.type || null,
      file_size_bytes: file.size,
      created_by: input.createdBy || null,
    })
  }

  if (rows.length === 0) {
    return { ok: true, error: null }
  }

  const { error } = await supabase.from('folio_attachments').insert(rows)
  if (error) {
    if (/folio_attachments/i.test(error.message) && /does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: 'Attachments are not set up yet. Run scripts/049_folio_attachments.sql in Supabase.',
      }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, error: null }
}
