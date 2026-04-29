import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { formatPersonName } from '@/lib/utils/name-format'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/users/[id] — update role, full_name, or password
// caller_id is passed from the client and validated server-side via admin client
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { caller_id, ...updates } = body

    if (!caller_id) return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })

    const admin = createAdminClient()

    // Verify caller has permission using admin client (bypasses RLS)
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!['superadmin', 'admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only superadmins, admins or managers can update users' }, { status: 403 })
    }

    // Verify target user belongs to same org
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', id)
      .single()

    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 })
    }

    if ((updates.role === 'superadmin' || targetProfile.role === 'superadmin') && callerProfile.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only a superadmin can assign or edit a superadmin' }, { status: 403 })
    }

    // Update auth user (password and/or metadata)
    const authUpdates: Record<string, any> = {}
    const formattedFullName = updates.full_name ? formatPersonName(updates.full_name) : ''
    if (updates.password) authUpdates.password = updates.password
    if (updates.full_name) authUpdates.user_metadata = { full_name: formattedFullName }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdates)
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Update profile row
    const profileUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (updates.role) profileUpdates.role = updates.role
    if (updates.full_name) profileUpdates.full_name = formattedFullName

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
// caller_id is passed from the client and validated server-side via admin client
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const { caller_id } = await request.json().catch(() => ({}))

    if (!caller_id) return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })

    if (caller_id === id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify caller has permission using admin client (bypasses RLS)
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!['superadmin', 'admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only superadmins, admins or managers can delete users' }, { status: 403 })
    }

    // Verify target belongs to same org
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', id)
      .single()

    if (!targetProfile || targetProfile.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 })
    }

    if (targetProfile.role === 'superadmin' && callerProfile.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only a superadmin can delete another superadmin' }, { status: 403 })
    }

    // Delete auth user (cascade deletes profile via FK)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
