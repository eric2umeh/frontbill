'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Plus, Users, Loader2 } from 'lucide-react'
import { AddRoomModal } from '@/components/rooms/add-room-modal'
import { toast } from 'sonner'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'

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
  updated_by?: string
  updated_by_name?: string
  updated_at?: string
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role, userId } = useAuth()
  const router = useRouter()

  const canAddRoom = hasPermission(role, 'rooms:create')

  useEffect(() => {
    fetchRooms()
  }, [])

  const fetchRooms = async () => {
    try {
      startFetch()
      const supabase = createClient()
      
      if (!supabase) {
        setRooms([])
        endFetch()
        return
      }

      const { data, error } = await supabase
        .from('rooms')
        .select('*, created_by, updated_by, updated_at')
        .eq('organization_id', organizationId)
        .order('room_number', { ascending: true })

      if (error) throw error
      
      // Fetch creator and updater profiles for all rooms
      const userIds = Array.from(new Set(
        [...(data || []).map((r: any) => r.created_by), ...(data || []).map((r: any) => r.updated_by)].filter(Boolean)
      ))
      const userMap = await fetchUserDisplayNameMap(userIds as string[], userId)
      
      // Add created_by_name and updated_by_name to each room
      const roomsWithUsers = (data || []).map((room: any) => ({
        ...room,
        created_by_name: room.created_by ? userMap[room.created_by] || getUserDisplayName(null, room.created_by) : 'System',
        updated_by_name: room.updated_by ? userMap[room.updated_by] || getUserDisplayName(null, room.updated_by) : null
      }))
      
      setRooms(roomsWithUsers)
    } catch (error: any) {
      console.error('Error fetching rooms:', error)
      toast.error('Failed to load rooms')
    } finally {
      endFetch()
    }
  }

  const statusColors: Record<string, string> = {
    available: 'bg-green-500/10 text-green-700 border-green-200',
    occupied: 'bg-red-500/10 text-red-700 border-red-200',
    cleaning: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    maintenance: 'bg-orange-500/10 text-orange-700 border-orange-200',
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
  }

  if (initialLoading) {
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
        {canAddRoom && (
          <Button onClick={() => setAddRoomModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
          Add Room
        </Button>
        )}
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
                <div className="text-xs text-muted-foreground">{room.floor_number === 0 ? 'Ground Floor' : `Floor ${room.floor_number}`}</div>
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
            key: 'amenities',
            label: 'Amenities',
            render: (room) => (
              <div className="flex flex-wrap gap-1 cursor-pointer" onClick={() => router.push(`/rooms/${room.id}`)}>
                {room.amenities && room.amenities.length > 0 ? (
                  room.amenities.slice(0, 3).map((a: string) => (
                    <Badge key={a} variant="secondary" className="text-xs py-0">{a}</Badge>
                  ))
                ) : <span className="text-muted-foreground text-sm">—</span>}
                {room.amenities && room.amenities.length > 3 && (
                  <Badge variant="secondary" className="text-xs py-0">+{room.amenities.length - 3}</Badge>
                )}
              </div>
            ),
          },
          {
            key: 'updated_at',
            label: 'Updated',
            render: (room) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => router.push(`/rooms/${room.id}`)}>
                {room.updated_at ? new Date(room.updated_at).toLocaleDateString('en-GB') : '—'}
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
          {
            key: 'updated_by_name',
            label: 'Last Updated',
            render: (room) => (
              <div className="text-sm">
                {room.updated_by_name ? (
                  <div className="text-muted-foreground">
                    {room.updated_by_name}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
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
                  <span className="font-medium">{room.floor_number === 0 ? 'Ground Floor' : `Floor ${room.floor_number}`}</span>
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
