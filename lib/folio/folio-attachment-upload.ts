import type { SupabaseClient } from '@supabase/supabase-js'
import type { FolioAttachmentSource } from '@/lib/folio/folio-attachment-types'

export const FOLIO_ATTACHMENTS_BUCKET = 'folio-attachments'

const MAX_FILE_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

export function validateFolioAttachmentFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return 'Each file must be 8 MB or smaller'
  }
  const t = (file.type || '').toLowerCase()
  if (t && !ALLOWED_TYPES.has(t)) {
    return 'Allowed types: JPEG, PNG, WebP, GIF, or PDF'
  }
  return null
}

export async function uploadFolioAttachmentFile(
  supabase: SupabaseClient,
  file: File,
  opts: {
    organizationId: string
    bookingId: string
    source: FolioAttachmentSource
  },
): Promise<{ publicUrl: string | null; error: string | null }> {
  const validation = validateFolioAttachmentFile(file)
  if (validation) return { publicUrl: null, error: validation }

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const safeExt = ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, '') : ''
  const path = `${opts.organizationId}/bookings/${opts.bookingId}/${opts.source}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`

  const { error } = await supabase.storage.from(FOLIO_ATTACHMENTS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })

  if (error) {
    return {
      publicUrl: null,
      error:
        error.message?.includes('Bucket not found') || error.message?.includes('not found')
          ? `Storage bucket "${FOLIO_ATTACHMENTS_BUCKET}" is missing. Run scripts/049_folio_attachments.sql in Supabase.`
          : error.message,
    }
  }

  const { data } = supabase.storage.from(FOLIO_ATTACHMENTS_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}
