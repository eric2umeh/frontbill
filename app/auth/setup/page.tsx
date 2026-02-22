import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Copy, Check, Settings } from 'lucide-react'
import Link from 'next/link'

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="max-w-2xl mx-auto space-y-6 py-12">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">FrontBill Setup</h1>
          <p className="text-lg text-muted-foreground">Connect your Supabase project</p>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <CardTitle>Environment Variables Required</CardTitle>
                <CardDescription>Add these to v0 project settings to connect to your Supabase database</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</Label>
                  <Badge>Required</Badge>
                </div>
                <div className="p-3 bg-muted rounded font-mono text-sm break-all">
                  https://tuahakfaqknmmdlqqrwr.supabase.co
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</Label>
                  <Badge>Required</Badge>
                </div>
                <div className="p-3 bg-muted rounded font-mono text-xs text-muted-foreground">
                  [Your Supabase Anon Key - Find in Supabase Dashboard → Settings → API]
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              How to Add Variables
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3">
              <li className="flex gap-3">
                <Badge variant="secondary" className="h-6 min-w-6 flex items-center justify-center rounded-full">1</Badge>
                <div>
                  <p className="font-semibold">Click on "Vars" in the v0 sidebar</p>
                  <p className="text-sm text-muted-foreground">Left side of your screen, next to "Design" and "Rules"</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="secondary" className="h-6 min-w-6 flex items-center justify-center rounded-full">2</Badge>
                <div>
                  <p className="font-semibold">Add the first variable</p>
                  <p className="text-sm text-muted-foreground">Name: NEXT_PUBLIC_SUPABASE_URL</p>
                  <p className="text-sm text-muted-foreground">Value: Copy from above</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="secondary" className="h-6 min-w-6 flex items-center justify-center rounded-full">3</Badge>
                <div>
                  <p className="font-semibold">Add the second variable</p>
                  <p className="text-sm text-muted-foreground">Name: NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
                  <p className="text-sm text-muted-foreground">Value: Copy from above</p>
                </div>
              </li>
              <li className="flex gap-3">
                <Badge variant="secondary" className="h-6 min-w-6 flex items-center justify-center rounded-full">4</Badge>
                <div>
                  <p className="font-semibold">Click Save</p>
                  <p className="text-sm text-muted-foreground">The app will automatically reload with new settings</p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What's Next?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">Once variables are added:</p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>Go to <code className="bg-muted px-2 py-1 rounded">/auth/sign-up</code> to create an account</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>You'll receive a verification email from Supabase</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>Verify your email and login</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span>Access the full dashboard with real-time data</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-4">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/auth/login">
              Go to Login
            </Link>
          </Button>
          <Button asChild className="flex-1">
            <Link href="/auth/sign-up">
              Create Account
            </Link>
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Need help? Check the SUPABASE_SETUP.md file in your project
        </p>
      </div>
    </div>
  )
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm font-medium ${className}`}>{children}</label>
}
