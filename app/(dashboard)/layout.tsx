import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { loadDashboardUser } from '@/lib/auth/load-dashboard-user'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const result = await loadDashboardUser()

  if (result.status === 'unauthenticated') {
    redirect('/auth/login')
  }

  if (result.status === 'forbidden') {
    redirect('/access-denied')
  }

  return <DashboardShell initialUser={result.user}>{children}</DashboardShell>
}
