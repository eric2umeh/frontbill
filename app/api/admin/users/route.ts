import { createAdminClient } from '@/lib/supabase/admin'
import { sendWelcomeEmail } from '@/lib/email/welcome-user'
import { NextResponse } from 'next/server'

// POST /api/admin/users — create a new user in the same organization
// caller_id is passed from the client (already authenticated in browser) and validated server-side
export async function POST(request: Request) {
  try {
    const { full_name, email, password, role, caller_id } = await request.json()

    if (!email || !password || !full_name || !role || !caller_id) {
      return NextResponse.json({ error: 'full_name, email, password, role and caller_id are required' }, { status: 400 })
    }

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

    if (!['superadmin', 'admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only superadmins, admins or managers can create users' }, { status: 403 })
    }

    if (role === 'superadmin' && callerProfile.role !== 'superadmin') {
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
      user_metadata: { full_name },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    // Upsert profile row with organization and role
    const profilePayload = {
      id: newUser.user.id,
      organization_id: callerProfile.organization_id,
      full_name,
      role,
      added_by: caller_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    let { error: profileError } = await admin
      .from('profiles')
      .upsert(profilePayload)

    if (profileError && /added_by/i.test(profileError.message || '')) {
      const fallbackPayload = { ...profilePayload } as any
      delete fallbackPayload.added_by
      const retry = await admin.from('profiles').upsert(fallbackPayload)
      profileError = retry.error
    }

    if (profileError) {
      // Rollback auth user if profile insert fails
      await admin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Send welcome email with login credentials — fire and forget (don't fail user creation if email fails)
    const site_url = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    let emailSent = false
    let emailError: string | null = null
    try {
      await sendWelcomeEmail({ full_name, email, password, role, site_url, org_name })
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
        full_name,
        role,
        added_by: caller_id,
        added_by_name: callerProfile.full_name || full_name,
        created_at: newUser.user.created_at,
      },
      emailSent,
      emailError,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
