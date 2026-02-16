import { createClient } from '@/lib/supabase/server'
import { OrganizationsTable } from '@/components/organizations/organizations-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default async function OrganizationsPage() {
  const supabase = await createClient()
  const { data: organizations } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Manage corporate, government, and NGO accounts
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Organization
        </Button>
      </div>

      <OrganizationsTable organizations={organizations || []} />
    </div>
  )
}
