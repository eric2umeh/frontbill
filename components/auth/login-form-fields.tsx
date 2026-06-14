'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'

/** Must be rendered inside the login `<form>` so `useFormStatus` reflects the server action. */
export function LoginSubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Logging in…
        </>
      ) : (
        'Login'
      )}
    </button>
  )
}

export function LoginPendingOverlay() {
  const { pending } = useFormStatus()
  if (!pending) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-8 py-6 shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Signing you in…</p>
      </div>
    </div>
  )
}
