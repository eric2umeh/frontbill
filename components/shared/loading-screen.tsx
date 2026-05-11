import { Loader2 } from 'lucide-react'

/** Full-app shell loading (e.g. dashboard layout). */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" aria-hidden />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

/** In-page route loading: same primary spinner as the shell, no redundant status line. */
export function PageLoadingState() {
  return (
    <div
      className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 bg-background"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
    </div>
  )
}

export function LoadingSpinner({ size = 'default' }: { size?: 'sm' | 'default' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-6 w-6',
    lg: 'h-8 w-8',
  }
  
  return <Loader2 className={`${sizeClasses[size]} animate-spin text-primary`} />
}
