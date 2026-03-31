import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/admin/users — create a new user in the same organization
export async function POST(request: Request) {
  try {
    const supabaseServer = await createClient()
    const { data: { user: caller } } = await supabaseServer.auth.getUser()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabaseServer
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 })
    }

    const { full_name, email, password, role } = await request.json()

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: 'full_name, email, password and role are required' }, { status: 400 })
    }

    const admin = createAdminClient()

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
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        organization_id: callerProfile.organization_id,
        full_name,
        role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      // Rollback auth user if profile insert fails
      await admin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      user: {
        id: newUser.user.id,
        email,
        full_name,
        role,
        created_at: newUser.user.created_at,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
