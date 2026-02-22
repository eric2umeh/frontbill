'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { LoadingScreen } from '@/components/shared/loading-screen'
import { createClient } from '@/lib/supabase/client'

interface DashboardUser {
  id: string
  email: string
  name: string
  role: string
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        if (!supabase) {
          console.log('[v0] Supabase not configured, redirecting to login')
          router.push('/auth/login')
          return
        }

        const { data: { user: authUser }, error } = await supabase.auth.getUser()
        
        if (error || !authUser) {
          console.log('[v0] No authenticated user, redirecting to login')
          router.push('/auth/login')
          return
        }

        // Get user profile from database
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', authUser.id)
          .single()

        if (!profileError && profile) {
          setUser({
            id: authUser.id,
            email: authUser.email || '',
            name: profile.full_name || authUser.email?.split('@')[0] || 'User',
            role: profile.role || 'staff',
          })
        } else {
          setUser({
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.email?.split('@')[0] || 'User',
            role: 'staff',
          })
        }
      } catch (error) {
        console.error('[v0] Auth check error:', error)
        router.push('/auth/login')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading || !user) {
    return <LoadingScreen />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
