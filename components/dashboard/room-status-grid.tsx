'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bed } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusConfig = {
  available: { label: 'Available', color: 'bg-green-500' },
  occupied: { label: 'Occupied', color: 'bg-blue-500' },
  reserved: { label: 'Reserved', color: 'bg-yellow-500' },
  maintenance: { label: 'Maintenance', color: 'bg-red-500' },
  cleaning: { label: 'Cleaning', color: 'bg-purple-500' },
}

// Mock rooms data
const mockRooms = [
  { id: 1, room_number: '101', status: 'occupied', floor: 1, room_type: 'single' },
  { id: 2, room_number: '102', status: 'available', floor: 1, room_type: 'double' },
  { id: 3, room_number: '103', status: 'occupied', floor: 1, room_type: 'suite' },
  { id: 4, room_number: '104', status: 'cleaning', floor: 1, room_type: 'single' },
  { id: 5, room_number: '201', status: 'occupied', floor: 2, room_type: 'double' },
  { id: 6, room_number: '202', status: 'reserved', floor: 2, room_type: 'suite' },
  { id: 7, room_number: '203', status: 'available', floor: 2, room_type: 'single' },
  { id: 8, room_number: '204', status: 'occupied', floor: 2, room_type: 'double' },
  { id: 9, room_number: '301', status: 'available', floor: 3, room_type: 'suite' },
  { id: 10, room_number: '302', status: 'maintenance', floor: 3, room_type: 'single' },
  { id: 11, room_number: '303', status: 'occupied', floor: 3, room_type: 'double' },
  { id: 12, room_number: '304', status: 'available', floor: 3, room_type: 'single' },
]

export function RoomStatusGrid() {
  const rooms = mockRooms

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bed className="h-5 w-5" />
          Room Status
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                      <p className="font-semibold text-sm">{room.room_number}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {room.room_type?.replace('_', ' ') || 'Standard'}
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
      </CardContent>
    </Card>
  )
}
