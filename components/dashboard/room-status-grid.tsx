import { createClient } from '@/lib/supabase/server'
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

export async function RoomStatusGrid() {
  const supabase = await createClient()
  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .order('room_number', { ascending: true })
    .limit(12)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bed className="h-5 w-5" />
          Room Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[350px]">
          <div className="grid grid-cols-2 gap-3">
            {rooms?.map((room) => {
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
                        {room.room_type.replace('_', ' ')}
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
