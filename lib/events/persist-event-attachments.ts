import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'folio-attachments'
const MAX_BYTES = 8 * 1024 * 1024

export async function uploadEventAttachmentFile(
  supabase: SupabaseClient,
  file: File,
  organizationId: string,
  eventId: string,
): Promise<{ publicUrl: string | null; error: string | null }> {
  if (file.size > MAX_BYTES) {
    return { publicUrl: null, error: `${file.name} exceeds 8 MB limit` }
  }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `events/${organizationId}/${eventId}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) {
    return {
      publicUrl: null,
      error: /bucket/i.test(error.message)
        ? `Storage bucket "${BUCKET}" is missing. Run scripts/049_folio_attachments.sql in Supabase.`
        : error.message,
    }
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

export async function persistEventAttachments(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    eventId: string
    files?: File[]
    createdBy?: string | null
  },
): Promise<{ ok: boolean; error: string | null }> {
  const files = input.files?.filter(Boolean) || []
  if (files.length === 0) return { ok: true, error: null }

  const rows: Record<string, unknown>[] = []
  for (const file of files) {
    const { publicUrl, error: upErr } = await uploadEventAttachmentFile(
      supabase,
      file,
      input.organizationId,
      input.eventId,
    )
    if (upErr || !publicUrl) return { ok: false, error: upErr || 'Upload failed' }
    rows.push({
      organization_id: input.organizationId,
      event_id: input.eventId,
      file_url: publicUrl,
      file_name: file.name,
      content_type: file.type || null,
      file_size_bytes: file.size,
      created_by: input.createdBy || null,
    })
  }

  const { error } = await supabase.from('event_attachments').insert(rows)
  if (error) {
    if (/event_attachments/i.test(error.message) && /does not exist/i.test(error.message)) {
      return { ok: false, error: 'Run scripts/056_event_attachments.sql in Supabase first.' }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, error: null }
}
