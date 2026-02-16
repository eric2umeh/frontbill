import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { email, password } = await request.json()

  console.log('[v0] API login called:', { email })

  try {
    const cookieStore = await cookies()
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('[v0] API login error:', error)
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    if (!data.session) {
      console.error('[v0] No session returned from login')
      return NextResponse.json({ error: 'No session created' }, { status: 401 })
    }

    console.log('[v0] API login successful:', data.user?.email)

    // Session cookies are automatically set by Supabase server client
    return NextResponse.json(
      { user: data.user, session: data.session, message: 'Login successful' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[v0] API login exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
