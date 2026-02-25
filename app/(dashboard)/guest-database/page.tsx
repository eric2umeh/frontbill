'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatNaira } from '@/lib/utils/currency'
import { Eye, History, Loader2 } from 'lucide-react'

interface Guest {
  id: string
  name: string
  phone: string
  email: string
  address: string
}

export default function GuestDatabasePage() {
  const [guests, setGuests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGuest, setSelectedGuest] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    fetchGuests()
  }, [])

  const fetchGuests = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setGuests([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setGuests([])
        return
      }

      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setGuests(data || [])
    } catch (error: any) {
      console.error('Error fetching guests:', error)
      setGuests([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guest Database</h1>
          <p className="text-muted-foreground">All guests with booking history and balances</p>
        </div>
      </div>

      <EnhancedDataTable
        data={guests}
        searchKeys={['name', 'phone', 'email']}
        filters={[]}
        columns={[
          {
            key: 'name',
            label: 'Guest',
            render: (guest) => (
              <div className="font-medium">{guest.name}</div>
            ),
          },
          {
            key: 'phone',
            label: 'Phone',
            render: (guest) => (
              <div className="text-sm">{guest.phone}</div>
            ),
          },
          {
            key: 'email',
            label: 'Email',
            render: (guest) => (
              <div className="text-sm">{guest.email || 'N/A'}</div>
            ),
          },
          {
            key: 'address',
            label: 'Address',
            render: (guest) => (
              <div className="text-sm">{guest.address || 'N/A'}</div>
            ),
          },
        ]}
        renderCard={(guest) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{guest.name}</div>
                  <div className="text-sm text-muted-foreground">{guest.phone}</div>
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <div className="text-sm">
                  <span className="text-muted-foreground">Email: </span>
                  {guest.email || 'N/A'}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Address: </span>
                  {guest.address || 'N/A'}
                </div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />

      {selectedGuest && (
        <Dialog open={!!selectedGuest} onOpenChange={() => setSelectedGuest(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Guest Details - {selectedGuest?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">Phone</div>
                  <div className="font-medium">{selectedGuest?.phone}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="font-medium">{selectedGuest?.email || 'N/A'}</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
