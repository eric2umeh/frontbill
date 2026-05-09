import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'store-attachments'

/**
 * Uploads a file to Supabase Storage. Create a public (or signed) bucket named `store-attachments`
 * in the Supabase Dashboard → Storage, or uploads will fail with a clear toast.
 */
export async function uploadStoreAttachment(
  supabase: SupabaseClient,
  file: File,
  opts: {
    organizationId: string
    folder: 'purchase-orders' | 'requisitions'
    documentId: string
  },
): Promise<{ publicUrl: string | null; error: string | null }> {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const safeExt = ext.length <= 12 ? ext : ''
  const path = `${opts.organizationId}/${opts.folder}/${opts.documentId}/${Date.now()}${safeExt}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    return {
      publicUrl: null,
      error:
        error.message?.includes('Bucket not found') || error.message?.includes('not found')
          ? `Storage bucket "${BUCKET}" is missing. Create it in Supabase → Storage (public read recommended for attachments).`
          : error.message,
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}
