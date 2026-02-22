import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function AuthErrorPage({ searchParams }: { searchParams: { error?: string } }) {
  const errorMessage = searchParams.error || 'Something went wrong during authentication'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Authentication Error</CardTitle>
          <CardDescription>
            Unable to complete authentication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <div className="p-3 bg-destructive/10 rounded text-sm text-destructive">
            {errorMessage}
          </div>
          <p className="text-sm text-muted-foreground">
            If you're seeing this after signup, please check your email for verification.
            If the error persists, try again or contact support.
          </p>
          <div className="pt-4 flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/auth/sign-up">
                Sign Up
              </Link>
            </Button>
            <Button asChild className="flex-1">
              <Link href="/auth/login">
                Login
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
