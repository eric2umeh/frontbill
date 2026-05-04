import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    console.log('Seeding demo users with admin client...')
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
      console.error('Error creating admin:', adminError)
      if (!adminError.message.includes('already exists')) {
        throw adminError
      }
    } else {
      console.log('Admin user created:', adminData.user?.email)
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
      console.error('Error creating front desk:', deskError)
      if (!deskError.message.includes('already exists')) {
        throw deskError
      }
    } else {
      console.log('Front desk user created:', deskData.user?.email)
    }

    const { error: storeError } = await supabase.auth.admin.createUser({
      email: 'store@frontbill.com',
      password: 'Store@123456',
      email_confirm: true,
      user_metadata: {
        full_name: 'Store Clerk',
        role: 'store',
      },
    })

    if (storeError) {
      console.error('Error creating store user:', storeError)
      if (!storeError.message.includes('already exists')) {
        throw storeError
      }
    } else {
      console.log('Store user created: store@frontbill.com')
    }

    return NextResponse.json({
      message: 'Demo users seeded successfully',
      credentials: [
        { email: 'admin@frontbill.com', password: 'Admin@123456', role: 'Admin' },
        { email: 'frontdesk@frontbill.com', password: 'Desk@123456', role: 'Front Desk' },
        { email: 'store@frontbill.com', password: 'Store@123456', role: 'Store' },
      ],
    })
  } catch (error: any) {
    console.error('Seed users error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
