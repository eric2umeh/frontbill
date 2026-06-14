'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

export default function SupplyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function SupplyPageShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
