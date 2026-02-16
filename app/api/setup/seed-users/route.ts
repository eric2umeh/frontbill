import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    console.log('[v0] Seeding demo users with admin client...')
    const supabase = createAdminClient()

    // Create demo admin account
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email: 'admin@frontbill.com',
      password: 'Admin@123456',
      email_confirm: true, // Auto-confirm email for demo
      user_metadata: {
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
      },
    })

    if (adminError) {
      console.error('[v0] Error creating admin:', adminError)
      // Ignore if user already exists
      if (!adminError.message.includes('already exists')) {
        throw adminError
      }
    } else {
      console.log('[v0] Admin user created:', adminData.user?.email)
    }

    // Create demo front desk account
    const { data: deskData, error: deskError } = await supabase.auth.admin.createUser({
      email: 'frontdesk@frontbill.com',
      password: 'Desk@123456',
      email_confirm: true,
      user_metadata: {
        first_name: 'Front',
        last_name: 'Desk',
        role: 'front_desk',
      },
    })

    if (deskError) {
      console.error('[v0] Error creating front desk:', deskError)
      if (!deskError.message.includes('already exists')) {
        throw deskError
      }
    } else {
      console.log('[v0] Front desk user created:', deskData.user?.email)
    }

    return NextResponse.json({
      message: 'Demo users seeded successfully',
      credentials: [
        { email: 'admin@frontbill.com', password: 'Admin@123456', role: 'Admin' },
        { email: 'frontdesk@frontbill.com', password: 'Desk@123456', role: 'Front Desk' },
      ],
    })
  } catch (error: any) {
    console.error('[v0] Seed users error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
