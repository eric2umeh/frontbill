import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  const { email, password, firstName, lastName, role } = await request.json()

  console.log('[v0] API sign-up called:', { email })

  try {
    const cookieStore = await cookies()
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          role,
        },
      },
    })

    if (error) {
      console.error('[v0] API sign-up error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (data.session) {
      // Manually set session cookie for development (email confirmation disabled)
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[v0] Session after signup:', session?.user?.email)
    }

    console.log('[v0] API sign-up successful:', data.user?.email)

    return NextResponse.json(
      { user: data.user, session: data.session, message: 'Account created successfully' },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[v0] API sign-up exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
