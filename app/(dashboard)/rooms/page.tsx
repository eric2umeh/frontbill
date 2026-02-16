'use client'

import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { generateRooms } from '@/lib/mock-data'
import { formatNaira } from '@/lib/utils/currency'
import { Plus, Users } from 'lucide-react'

const mockRooms = generateRooms()

export default function RoomsPage() {
  const statusColors = {
    available: 'bg-green-500/10 text-green-700 border-green-200',
    occupied: 'bg-red-500/10 text-red-700 border-red-200',
    cleaning: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    maintenance: 'bg-orange-500/10 text-orange-700 border-orange-200',
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rooms</h1>
          <p className="text-muted-foreground">Manage room inventory and status</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Room
        </Button>
      </div>

      <EnhancedDataTable
        data={mockRooms}
        searchKeys={['number', 'type']}
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
          {
            key: 'floor',
            label: 'Floor',
            options: [
              { value: '1', label: 'Floor 1' },
              { value: '2', label: 'Floor 2' },
              { value: '3', label: 'Floor 3' },
            ],
          },
          {
            key: 'roomType',
            label: 'Room Type',
            options: [
              { value: 'deluxe', label: 'Deluxe' },
              { value: 'royal', label: 'Royal Suite' },
              { value: 'king', label: 'King Suite' },
              { value: 'mini', label: 'Mini Suite' },
              { value: 'executive', label: 'Executive' },
              { value: 'diplomatic', label: 'Diplomatic' },
            ],
          },
        ]}
        columns={[
          {
            key: 'number',
            label: 'Room',
            render: (room) => (
              <div>
                <div className="font-semibold text-lg">Room {room.number}</div>
                <div className="text-xs text-muted-foreground">Floor {room.floor}</div>
              </div>
            ),
          },
          {
            key: 'type',
            label: 'Type',
            render: (room) => <div className="font-medium">{room.type}</div>,
          },
          {
            key: 'capacity',
            label: 'Capacity',
            render: (room) => (
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{room.capacity}</span>
              </div>
            ),
          },
          {
            key: 'rate',
            label: 'Rate/Night',
            render: (room) => <div className="font-semibold">{formatNaira(room.rate)}</div>,
          },
          {
            key: 'status',
            label: 'Status',
            render: (room) => (
              <Badge variant="outline" className={statusColors[room.status]}>
                {room.status}
              </Badge>
            ),
          },
        ]}
        renderCard={(room) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold">Room {room.number}</div>
                  <div className="text-sm text-muted-foreground">{room.type}</div>
                </div>
                <Badge variant="outline" className={statusColors[room.status]}>
                  {room.status}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Floor</span>
                  <span className="font-medium">{room.floor}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Capacity</span>
                  <span className="font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {room.capacity} guests
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rate/Night</span>
                  <span className="font-semibold">{formatNaira(room.rate)}</span>
                </div>
              </div>
              {room.amenities && room.amenities.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Amenities</div>
                  <div className="flex flex-wrap gap-1">
                    {room.amenities.slice(0, 3).map((amenity, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {amenity}
                      </Badge>
                    ))}
                    {room.amenities.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{room.amenities.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
        itemsPerPage={12}
      />
    </div>
  )
}
