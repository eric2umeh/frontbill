'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { canonicalRoleKey } from '@/lib/permissions'

/** Front Desk keeps `store:requisition` for data model but must not access store UI per product policy */
export default function StoreSectionLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (canonicalRoleKey(role) === 'front_desk') {
      router.replace('/dashboard')
    }
  }, [role, router])

  if (canonicalRoleKey(role) === 'front_desk') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
