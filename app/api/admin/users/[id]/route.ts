import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/users/[id] — update role, full_name, or password
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabaseServer = await createClient()
    const { data: { user: caller } } = await supabaseServer.auth.getUser()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabaseServer
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only admins or managers can update users' }, { status: 403 })
    }

    const body = await request.json()
    const admin = createAdminClient()

    // Verify target user belongs to same org
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', id)
      .single()

    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 })
    }

    // Update auth user (password and/or metadata)
    const authUpdates: Record<string, any> = {}
    if (body.password) authUpdates.password = body.password
    if (body.full_name) authUpdates.user_metadata = { full_name: body.full_name }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdates)
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Update profile row
    const profileUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.role) profileUpdates.role = body.role
    if (body.full_name) profileUpdates.full_name = body.full_name

    const { error: profileError } = await admin
      .from('profiles')
      .update(profileUpdates)
      .eq('id', id)

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/admin/users/[id] — permanently remove user
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabaseServer = await createClient()
    const { data: { user: caller } } = await supabaseServer.auth.getUser()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (caller.id === id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    const { data: callerProfile } = await supabaseServer
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only admins or managers can delete users' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Verify target belongs to same org
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', id)
      .single()

    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 })
    }

    // Delete auth user (cascade deletes profile via FK)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
