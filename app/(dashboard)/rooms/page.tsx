'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { Plus, Users, Loader2 } from 'lucide-react'
import { AddRoomModal } from '@/components/rooms/add-room-modal'
import { toast } from 'sonner'

interface Room {
  id: string
  room_number: string
  room_type: string
  floor_number: number
  max_occupancy: number
  price_per_night: number
  status: string
  amenities: string[]
  created_by?: string
  created_by_name?: string
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchRooms()
  }, [])

  const fetchRooms = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        // No Supabase configured - show empty state
        setRooms([])
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
        toast.error('Organization not found')
        return
      }

      const { data, error } = await supabase
        .from('rooms')
        .select('*, created_by')
        .eq('organization_id', profile.organization_id)
        .order('room_number', { ascending: true })

      if (error) throw error
      
      // Fetch creator profiles for all rooms
      const creatorIds = Array.from(new Set((data || []).map((r: any) => r.created_by).filter(Boolean)))
      let creatorMap: { [key: string]: string } = {}
      
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds)
        
        profiles?.forEach(profile => {
          creatorMap[profile.id] = profile.full_name || 'Unknown User'
        })
      }
      
      // Add created_by_name to each room
      const roomsWithCreator = (data || []).map((room: any) => ({
        ...room,
        created_by_name: room.created_by ? creatorMap[room.created_by] || 'Unknown User' : 'System'
      }))
      
      setRooms(roomsWithCreator)
    } catch (error: any) {
      console.error('Error fetching rooms:', error)
      toast.error('Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  const statusColors = {
    available: 'bg-green-500/10 text-green-700 border-green-200',
    occupied: 'bg-red-500/10 text-red-700 border-red-200',
    cleaning: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    maintenance: 'bg-orange-500/10 text-orange-700 border-orange-200',
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
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
      <AddRoomModal 
        open={addRoomModalOpen} 
        onClose={() => { 
          setAddRoomModalOpen(false)
          // Small delay to ensure database is updated
          setTimeout(() => fetchRooms(), 500)
        }}
      />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rooms</h1>
          <p className="text-muted-foreground">Manage room inventory and status</p>
        </div>
        <Button onClick={() => setAddRoomModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Room
        </Button>
      </div>

      <EnhancedDataTable
        data={rooms}
        searchKeys={['room_number', 'room_type']}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'available', label: 'Available' },
              { value: 'occupied', label: 'Occupied' },
              { value: 'reserved', label: 'Reserved' },
              { value: 'cleaning', label: 'Cleaning' },
              { value: 'maintenance', label: 'Maintenance' },
            ],
          },
        ]}
        columns={[
          {
            key: 'room_number',
            label: 'Room',
            render: (room) => (
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(`/rooms/${room.id}`)}
              >
                <div className="font-semibold text-lg">Room {room.room_number}</div>
                <div className="text-xs text-muted-foreground">Floor {room.floor_number}</div>
              </div>
            ),
          },
          {
            key: 'room_type',
            label: 'Type',
            render: (room) => (
              <div 
                className="cursor-pointer font-medium hover:text-primary"
                onClick={() => router.push(`/rooms/${room.id}`)}
              >
                {room.room_type}
              </div>
            ),
          },
          {
            key: 'max_occupancy',
            label: 'Capacity',
            render: (room) => (
              <div 
                className="cursor-pointer flex items-center gap-1 hover:text-primary"
                onClick={() => router.push(`/rooms/${room.id}`)}
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{room.max_occupancy}</span>
              </div>
            ),
          },
          {
            key: 'price_per_night',
            label: 'Rate/Night',
            render: (room) => (
              <div 
                className="cursor-pointer font-semibold hover:text-primary"
                onClick={() => router.push(`/rooms/${room.id}`)}
              >
                {formatNaira(room.price_per_night)}
              </div>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            render: (room) => (
              <div 
                className="cursor-pointer"
                onClick={() => router.push(`/rooms/${room.id}`)}
              >
                <Badge variant="outline" className={statusColors[room.status]}>
                  {room.status}
                </Badge>
              </div>
            ),
          },
          {
            key: 'created_by_name',
            label: 'Created By',
            render: (room) => (
              <div className="text-sm text-muted-foreground">
                {room.created_by_name}
              </div>
            ),
          },
        ]}
        renderCard={(room) => (
          <CardContent 
            className="p-4 cursor-pointer hover:bg-accent"
            onClick={() => router.push(`/rooms/${room.id}`)}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold">Room {room.room_number}</div>
                  <div className="text-sm text-muted-foreground">{room.room_type}</div>
                </div>
                <Badge variant="outline" className={statusColors[room.status]}>
                  {room.status}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Floor</span>
                  <span className="font-medium">{room.floor_number}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Capacity</span>
                  <span className="font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {room.max_occupancy} guests
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rate/Night</span>
                  <span className="font-semibold">{formatNaira(room.price_per_night)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={12}
      />
    </div>
  )
}
