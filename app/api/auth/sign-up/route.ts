import { createAdminClient } from '@/lib/supabase/admin'
import { ensureHotelOwnerProfile } from '@/lib/auth/ensure-hotel-owner-profile'
import { isPublicSignupEnabled } from '@/lib/auth/public-signup'
import { NextResponse } from 'next/server'

/** POST — create hotel owner account (staging/dev when public signup enabled). */
export async function POST(request: Request) {
  if (!isPublicSignupEnabled()) {
    return NextResponse.json(
      { error: 'Public signup is disabled. Ask an admin to add you under Users & Roles.' },
      { status: 403 },
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const firstName = String(body?.firstName ?? '').trim()
    const lastName = String(body?.lastName ?? '').trim()
    const hotelName = String(body?.hotelName ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const password = String(body?.password ?? '')

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First and last name are required' }, { status: 400 })
    }
    if (!hotelName) {
      return NextResponse.json({ error: 'Hotel name is required' }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    let admin
    try {
      admin = createAdminClient()
    } catch {
      return NextResponse.json(
        {
          error:
            'Signup is not configured on the server (missing SUPABASE_SERVICE_ROLE_KEY in .env.local).',
        },
        { status: 503 },
      )
    }

    const fullName = `${firstName} ${lastName}`

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        hotel_name: hotelName,
        create_hotel: 'true',
        role: 'admin',
      },
    })

    if (error) {
      const msg = error.message || 'Failed to create account'
      if (/already|exists|registered/i.test(msg)) {
        return NextResponse.json(
          { error: 'This email is already registered. Please sign in.' },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const userId = data.user?.id
    if (userId) {
      const { organizationId, error: orgError } = await ensureHotelOwnerProfile(admin, {
        userId,
        email,
        fullName,
        hotelName,
      })
      if (!organizationId) {
        console.error('[auth/sign-up] hotel org link failed', orgError)
        return NextResponse.json(
          {
            error:
              orgError ||
              'Account created but hotel setup failed. Sign in and contact support, or run scripts/066_signup_creates_hotel.sql on Supabase.',
          },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ ok: true, userId: userId ?? null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
