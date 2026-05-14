import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey } from '@/lib/permissions'

const BUCKET = 'hotel-logos'
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function extForMime(mime: string) {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  return ''
}

async function requireSuperadminOrg() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Server is missing Supabase service credentials.' },
        { status: 503 },
      ),
    }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  if (canonicalRoleKey(profile.role) !== 'superadmin') {
    return { error: NextResponse.json({ error: 'Only a Superadmin may change the hotel logo.' }, { status: 403 }) }
  }

  return { admin, organizationId: profile.organization_id as string }
}

export async function POST(request: Request) {
  const gate = await requireSuperadminOrg()
  if ('error' in gate) return gate.error
  const { admin, organizationId } = gate

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo must be 2 MB or smaller' }, { status: 400 })
  }
  const mime = (file.type || '').toLowerCase()
  if (!ALLOWED_TYPES.has(mime)) {
    return NextResponse.json({ error: 'Allowed types: PNG, JPEG, WebP, GIF' }, { status: 400 })
  }

  const ext = extForMime(mime)
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 })
  }

  const path = `${organizationId}/logo-${Date.now()}${ext}`

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: mime,
    upsert: false,
  })

  if (uploadError) {
    const msg = uploadError.message || 'Upload failed'
    const hint =
      msg.includes('Bucket not found') || msg.includes('not found')
        ? `Create the "${BUCKET}" storage bucket (see scripts/041_organization_hotel_logo.sql).`
        : msg
    return NextResponse.json({ error: hint }, { status: 400 })
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl = pub.publicUrl

  const { error: updateError } = await admin
    .from('organizations')
    .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', organizationId)

  if (updateError) {
    const m = updateError.message || ''
    if (m.includes('logo_url') && (m.includes('does not exist') || m.includes('schema cache'))) {
      return NextResponse.json(
        {
          error:
            'Database column organizations.logo_url is missing. Run scripts/041_organization_hotel_logo.sql in the Supabase SQL editor.',
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: m || 'Failed to save logo URL' }, { status: 400 })
  }

  return NextResponse.json({ logo_url: publicUrl })
}

export async function DELETE() {
  const gate = await requireSuperadminOrg()
  if ('error' in gate) return gate.error
  const { admin, organizationId } = gate

  const { error: updateError } = await admin
    .from('organizations')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', organizationId)

  if (updateError) {
    const m = updateError.message || ''
    if (m.includes('logo_url') && (m.includes('does not exist') || m.includes('schema cache'))) {
      return NextResponse.json(
        {
          error:
            'Database column organizations.logo_url is missing. Run scripts/041_organization_hotel_logo.sql in the Supabase SQL editor.',
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: m || 'Failed to remove logo' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
