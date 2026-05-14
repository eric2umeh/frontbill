import { createAdminClient } from '@/lib/supabase/admin'
import { sendWelcomeEmail } from '@/lib/email/welcome-user'
import { NextResponse } from 'next/server'
import { formatPersonName } from '@/lib/utils/name-format'
import { canonicalRoleKey } from '@/lib/permissions'
import { resolveStaffDisplayName } from '@/lib/utils/resolve-staff-display-name'

// POST /api/admin/users — create a new user in the same organization
// caller_id is passed from the client (already authenticated in browser) and validated server-side
export async function POST(request: Request) {
  try {
    const { full_name, email, password, role, caller_id } = await request.json()

    if (!email || !password || !full_name || !role || !caller_id) {
      return NextResponse.json({ error: 'full_name, email, password, role and caller_id are required' }, { status: 400 })
    }
    const formattedFullName = formatPersonName(full_name)

    const admin = createAdminClient()

    // Verify caller exists and has the right role/org using the admin client (bypasses RLS)
    const { data: callerProfile, error: profileFetchError } = await admin
      .from('profiles')
      .select('role, organization_id, full_name')
      .eq('id', caller_id)
      .single()

    if (profileFetchError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    const callerKey = canonicalRoleKey(callerProfile.role)
    if (!callerKey || !['superadmin', 'admin', 'manager'].includes(callerKey)) {
      return NextResponse.json({ error: 'Only superadmins, admins or managers can create users' }, { status: 403 })
    }

    const newRoleKey = canonicalRoleKey(role)
    if (!newRoleKey) {
      return NextResponse.json({ error: 'Invalid role value' }, { status: 400 })
    }

    if (newRoleKey === 'superadmin' && callerKey !== 'superadmin') {
      return NextResponse.json({ error: 'Only a superadmin can create a superadmin' }, { status: 403 })
    }

    // Fetch organization name for the welcome email
    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', callerProfile.organization_id)
      .single()
    const org_name = orgData?.name || 'Your Organization'

    // Create auth user with email confirmed (no signup flow needed)
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: formattedFullName },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    // `handle_new_user` inserts a bare profile row first; PostgREST upserts often fail to persist `added_by`.
    // Replace that stub with a full row so "Added by" is reliable in Users & Roles.
    const newId = newUser.user.id
    const now = new Date().toISOString()
    const profileRow = {
      id: newId,
      organization_id: callerProfile.organization_id,
      full_name: formattedFullName,
      role: newRoleKey,
      added_by: caller_id,
      created_at: now,
      updated_at: now,
    }

    await admin.from('profiles').delete().eq('id', newId)

    let { error: profileError } = await admin.from('profiles').insert(profileRow)

    if (profileError && /23505|duplicate key/i.test(profileError.message || '')) {
      const { error: upErr } = await admin
        .from('profiles')
        .update({
          organization_id: profileRow.organization_id,
          full_name: profileRow.full_name,
          role: profileRow.role,
          added_by: caller_id,
          updated_at: profileRow.updated_at,
        })
        .eq('id', newId)
      profileError = upErr
    }

    if (profileError && /added_by/i.test(profileError.message || '')) {
      const { added_by: _drop, ...withoutAddedBy } = profileRow
      const { error: ins2 } = await admin.from('profiles').insert(withoutAddedBy)
      profileError = ins2
    }

    if (profileError) {
      await admin.auth.admin.deleteUser(newId)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    const addedByName = await resolveStaffDisplayName(admin, caller_id, callerProfile.full_name)

    const { data: freshProfile } = await admin
      .from('profiles')
      .select('added_by, created_at')
      .eq('id', newUser.user.id)
      .maybeSingle()

    // Send welcome email with login credentials — fire and forget (don't fail user creation if email fails)
    const site_url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    let emailSent = false
    let emailError: string | null = null
    try {
      await sendWelcomeEmail({ full_name: formattedFullName, email, password, role: newRoleKey, site_url, org_name })
      emailSent = true
    } catch (emailErr: any) {
      // Log but don't fail — user was created successfully
      console.error('Welcome email failed (user still created):', emailErr)
      // Return the error message to show the admin
      emailError = emailErr.message || 'Failed to send email'
    }

    return NextResponse.json({
      user: {
        id: newUser.user.id,
        email,
        full_name: formattedFullName,
        role: newRoleKey,
        added_by: freshProfile?.added_by ?? caller_id,
        added_by_name: addedByName,
        created_at: freshProfile?.created_at ?? newUser.user.created_at,
      },
      emailSent,
      emailError,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
