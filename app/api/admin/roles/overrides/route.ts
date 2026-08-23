import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import {
  canonicalRoleKey,
  parsePermissionOverrides,
  parseRolePermissionOverridesMap,
  type RoleKey,
} from '@/lib/permissions'

/** GET /api/admin/roles/overrides?caller_id=... */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const caller_id = searchParams.get('caller_id')
    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: caller, error: callerErr } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerErr || !caller) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    const callerKey = canonicalRoleKey(caller.role)
    if (!callerKey || !['superadmin', 'admin'].includes(callerKey)) {
      return NextResponse.json(
        { error: 'Only superadmins or admins can view role permission overrides' },
        { status: 403 },
      )
    }

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('role_permission_overrides')
      .eq('id', caller.organization_id)
      .single()

    if (orgErr) {
      if (/role_permission_overrides/i.test(orgErr.message || '')) {
        return NextResponse.json({
          role_permission_overrides: null,
          migration_required: true,
        })
      }
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }

    return NextResponse.json({
      role_permission_overrides: parseRolePermissionOverridesMap(
        org?.role_permission_overrides,
      ),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** PATCH /api/admin/roles/overrides — set overrides for one role key */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const caller_id = body.caller_id as string | undefined
    const role = body.role as string | undefined
    const permission_overrides = body.permission_overrides

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }
    const roleKey = canonicalRoleKey(role) as RoleKey | null
    if (!roleKey) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: caller, error: callerErr } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerErr || !caller) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    const callerKey = canonicalRoleKey(caller.role)
    if (!callerKey || !['superadmin', 'admin'].includes(callerKey)) {
      return NextResponse.json(
        { error: 'Only superadmins or admins can edit role permissions' },
        { status: 403 },
      )
    }

    if (roleKey === 'superadmin' && callerKey !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only a superadmin can edit the superadmin role' },
        { status: 403 },
      )
    }

    const { data: org, error: orgReadErr } = await admin
      .from('organizations')
      .select('role_permission_overrides')
      .eq('id', caller.organization_id)
      .single()

    if (orgReadErr) {
      if (/role_permission_overrides/i.test(orgReadErr.message || '')) {
        return NextResponse.json(
          {
            error:
              'Run scripts/081_organization_role_permission_overrides.sql on this Supabase project first.',
          },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: orgReadErr.message }, { status: 500 })
    }

    const current = parseRolePermissionOverridesMap(org?.role_permission_overrides) ?? {}
    const normalized = parsePermissionOverrides(permission_overrides)
    const next = { ...current }
    if (normalized) next[roleKey] = normalized
    else delete next[roleKey]

    const payload =
      Object.keys(next).length > 0 ? next : null

    const { error: updateErr } = await admin
      .from('organizations')
      .update({
        role_permission_overrides: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caller.organization_id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      role_permission_overrides: payload,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
