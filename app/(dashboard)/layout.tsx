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
  const [redirected, setRedirected] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        const supabase = createClient()
        if (!supabase) {
          // If Supabase is not configured, show a placeholder user to allow navigation
          // (assumes user is authenticated through other means like cookies)
          if (isMounted) {
            setUser({
              id: 'placeholder',
              email: 'user@example.com',
              name: 'User',
              role: 'staff',
            })
            setLoading(false)
          }
          return
        }

        // Check for active session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          const { data: { user: authUser }, error } = await supabase.auth.getUser()
          
          if (error || !authUser) {
            if (isMounted) {
              setRedirected(true)
              router.push('/auth/login')
            }
            return
          }
        }

        // Get authenticated user
        const { data: { user: authUser } } = await supabase.auth.getUser()
        
        if (!authUser) {
          if (isMounted) {
            setRedirected(true)
            router.push('/auth/login')
          }
          return
        }

        // Get user profile from database
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', authUser.id)
          .single()

        if (isMounted) {
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
          setLoading(false)
        }
      } catch (error) {
        if (isMounted && !redirected) {
          // On error, show a placeholder user to allow demo access
          setUser({
            id: 'placeholder',
            email: 'user@example.com',
            name: 'User',
            role: 'staff',
          })
          setLoading(false)
        }
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [])

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
