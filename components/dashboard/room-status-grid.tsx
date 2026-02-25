'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bed, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface Room {
  id: string
  number: string
  type: string
  floor: number
  status: string
}

const statusConfig = {
  available: { label: 'Available', color: 'bg-green-500' },
  occupied: { label: 'Occupied', color: 'bg-blue-500' },
  reserved: { label: 'Reserved', color: 'bg-yellow-500' },
  maintenance: { label: 'Maintenance', color: 'bg-red-500' },
  cleaning: { label: 'Cleaning', color: 'bg-purple-500' },
}

export function RoomStatusGrid() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const fetchTimeoutRef = useEffect === null ? { current: null } : { current: null as any }

  useEffect(() => {
    let isMounted = true
    
    const fetchRooms = async () => {
      try {
        setLoading(true)
        const supabase = createClient()
        
        if (!supabase) {
          if (isMounted) setRooms([])
          return
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !isMounted) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single()

        if (!profile || !isMounted) return

        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('room_number', { ascending: true })
          .limit(12)

        if (error) throw error
        if (isMounted) setRooms(data || [])
      } catch (error: any) {
        console.error('[v0] Error fetching rooms:', error)
        if (isMounted) setRooms([])
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchRooms()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bed className="h-5 w-5" />
          Room Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            <p className="text-sm">No rooms available</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="grid grid-cols-3 gap-3">
              {rooms.map((room) => {
                const config = statusConfig[room.status as keyof typeof statusConfig]
                return (
                  <div
                    key={room.id}
                    className={cn(
                      'relative rounded-lg border-2 p-3 transition-all hover:shadow-md',
                      room.status === 'available' ? 'border-green-200 bg-green-50' :
                      room.status === 'occupied' ? 'border-blue-200 bg-blue-50' :
                      room.status === 'reserved' ? 'border-yellow-200 bg-yellow-50' :
                      room.status === 'maintenance' ? 'border-red-200 bg-red-50' :
                      'border-purple-200 bg-purple-50'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{room.number}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {room.type?.replace('_', ' ') || 'Standard'}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          config?.color
                        )}
                      />
                    </div>
                    <p className="mt-1 text-xs font-medium capitalize">
                      {config?.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
