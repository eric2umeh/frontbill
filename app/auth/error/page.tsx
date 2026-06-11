import { Suspense } from 'react'
import { AuthErrorContent } from './auth-error-content'

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  )
}
