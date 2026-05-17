import { createAdminClient } from '@/lib/supabase/admin'
import { validateFolioAttachmentFile } from '@/lib/folio/folio-attachment-upload'
import { NextResponse } from 'next/server'

async function loadCaller(admin: ReturnType<typeof createAdminClient>, callerId: string) {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', callerId)
    .single()
  if (error || !profile?.organization_id) return null
  return profile as { role: string; organization_id: string }
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await ctx.params
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const sourceId = searchParams.get('source_id')
    const source = searchParams.get('source')

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const caller = await loadCaller(admin, callerId)
    if (!caller) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: booking, error: bErr } = await admin
      .from('bookings')
      .select('id, organization_id')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking || booking.organization_id !== caller.organization_id) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    let query = admin
      .from('folio_attachments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })

    if (source) query = query.eq('source', source)
    if (sourceId) query = query.eq('source_id', sourceId)

    const { data: rows, error } = await query
    if (error) {
      if (/folio_attachments/i.test(error.message) && /does not exist/i.test(error.message)) {
        return NextResponse.json({ attachments: [] })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const creatorIds = Array.from(
      new Set((rows || []).map((r: { created_by?: string }) => r.created_by).filter(Boolean)),
    ) as string[]
    const nameMap: Record<string, string> = {}
    if (creatorIds.length) {
      const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', creatorIds)
      ;(profiles || []).forEach((p: { id: string; full_name?: string }) => {
        nameMap[p.id] = String(p.full_name || '').trim() || `User ${p.id.slice(0, 8)}`
      })
    }

    return NextResponse.json({
      attachments: (rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        created_by_name: r.created_by ? nameMap[String(r.created_by)] || null : null,
      })),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await ctx.params
    const form = await request.formData()
    const callerId = form.get('caller_id') as string | null
    const remarks = String(form.get('remarks') || '').trim()
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }
    if (!remarks && files.length === 0) {
      return NextResponse.json({ error: 'Add a remark or at least one file' }, { status: 400 })
    }

    const admin = createAdminClient()
    const caller = await loadCaller(admin, callerId)
    if (!caller) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: booking, error: bErr } = await admin
      .from('bookings')
      .select('id, organization_id')
      .eq('id', bookingId)
      .single()

    if (bErr || !booking || booking.organization_id !== caller.organization_id) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const rows: Record<string, unknown>[] = []

    if (remarks && files.length === 0) {
      rows.push({
        organization_id: caller.organization_id,
        booking_id: bookingId,
        source: 'manual',
        remarks,
        created_by: callerId,
      })
    }

    for (const file of files) {
      const validation = validateFolioAttachmentFile(file)
      if (validation) {
        return NextResponse.json({ error: validation }, { status: 400 })
      }

      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
      const safeExt = ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, '') : ''
      const path = `${caller.organization_id}/bookings/${bookingId}/manual/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`

      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await admin.storage.from('folio-attachments').upload(path, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })

      if (upErr) {
        const msg =
          upErr.message?.includes('Bucket not found') || upErr.message?.includes('not found')
            ? 'Storage bucket "folio-attachments" is missing. Run scripts/049_folio_attachments.sql.'
            : upErr.message
        return NextResponse.json({ error: msg }, { status: 500 })
      }

      const { data: pub } = admin.storage.from('folio-attachments').getPublicUrl(path)

      rows.push({
        organization_id: caller.organization_id,
        booking_id: bookingId,
        source: 'manual',
        remarks: remarks || null,
        file_url: pub.publicUrl,
        file_name: file.name,
        content_type: file.type || null,
        file_size_bytes: file.size,
        created_by: callerId,
      })
    }

    const { data: inserted, error: insErr } = await admin.from('folio_attachments').insert(rows).select('*')
    if (insErr) {
      if (/folio_attachments/i.test(insErr.message) && /does not exist/i.test(insErr.message)) {
        return NextResponse.json(
          { error: 'Run scripts/049_folio_attachments.sql in Supabase first.' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ attachments: inserted })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
