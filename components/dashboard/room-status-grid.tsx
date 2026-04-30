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
  out_of_order: { label: 'Out of Order', color: 'bg-red-700' },
}

const statusPriority: Record<string, number> = {
  occupied: 1,
  maintenance: 2,
  out_of_order: 3,
  cleaning: 4,
  reserved: 5,
  available: 6,
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
          .select('id, room_number, room_type, status, organization_id')
          .eq('organization_id', profile.organization_id)
          .order('room_number', { ascending: true })

        if (error) throw error
        const sortedRooms = (data || []).sort((a: any, b: any) => {
          const priorityDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99)
          if (priorityDiff !== 0) return priorityDiff
          return String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true })
        })
        if (isMounted) setRooms(sortedRooms)
      } catch (error: any) {
        console.error('Error fetching rooms:', error)
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rooms.map((room) => {
                const config = statusConfig[room.status as keyof typeof statusConfig]
                return (
                  <div
                    key={room.id}
                    className={cn(
                      'relative rounded-md border p-2 transition-all hover:shadow-sm',
                      room.status === 'available' ? 'border-green-200 bg-green-50' :
                      room.status === 'occupied' ? 'border-blue-200 bg-blue-50' :
                      room.status === 'reserved' ? 'border-yellow-200 bg-yellow-50' :
                      room.status === 'maintenance' ? 'border-red-200 bg-red-50' :
                      'border-purple-200 bg-purple-50'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold leading-tight">{room.room_number}</p>
                        <p className="truncate text-[10px] capitalize leading-tight text-muted-foreground">
                          {room.room_type?.replace('_', ' ') || 'Standard'}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full',
                          config?.color
                        )}
                      />
                    </div>
                    <p className="mt-1 text-[10px] font-medium capitalize leading-tight">
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
