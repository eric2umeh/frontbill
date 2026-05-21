import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventsAuthed } from '@/lib/events/api-auth'
import { persistEventAttachments } from '@/lib/events/persist-event-attachments'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveEventsAuthed(request, { requireManage: true })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing, error: fe } = await admin
    .from('hotel_events')
    .select('id, organization_id')
    .eq('id', id)
    .single()

  if (fe || !existing || existing.organization_id !== auth.ctx.organizationId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart form required' }, { status: 400 })

  const files: File[] = []
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) files.push(entry)
  }

  if (files.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const result = await persistEventAttachments(admin, {
    organizationId: auth.ctx.organizationId,
    eventId: id,
    files,
    createdBy: auth.ctx.userId,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
