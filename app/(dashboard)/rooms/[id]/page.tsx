'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Edit, Trash2, Users, DollarSign, MapPin } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

export default function RoomDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [editModalOpen, setEditModalOpen] = useState(false)
  
  const roomData = searchParams.get('data')
  const room = roomData ? JSON.parse(decodeURIComponent(roomData)) : null

  const [formData, setFormData] = useState({
    number: room?.number || '',
    type: room?.type || '',
    floor: room?.floor || '',
    capacity: room?.capacity || '',
    rate: room?.rate || '',
    status: room?.status || 'available',
    amenities: room?.amenities || [],
  })

  const statusColors = {
    available: 'bg-green-500/10 text-green-700 border-green-200',
    occupied: 'bg-red-500/10 text-red-700 border-red-200',
    cleaning: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    maintenance: 'bg-orange-500/10 text-orange-700 border-orange-200',
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
  }

  const handleSaveChanges = () => {
    toast.success('Room details updated successfully')
    setEditModalOpen(false)
  }

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      toast.success('Room deleted successfully')
      router.back()
    }
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Room not found</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Room Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Room Number</Label>
              <Input
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                placeholder="e.g., 101"
              />
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Input
                type="number"
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                placeholder="e.g., 1"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rate Per Night</Label>
              <Input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                placeholder="e.g., 50000"
              />
            </div>
            <Button onClick={handleSaveChanges} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Rooms
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-3xl">Room {room.number}</CardTitle>
              <p className="text-muted-foreground mt-1">{room.type}</p>
            </div>
            <Badge variant="outline" className={statusColors[room.status]}>
              {room.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="text-sm">Location</span>
              </div>
              <p className="font-semibold">Floor {room.floor}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-sm">Capacity</span>
              </div>
              <p className="font-semibold">{room.capacity} guests</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">Rate/Night</span>
              </div>
              <p className="font-semibold">{formatNaira(room.rate)}</p>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Status</div>
              <p className="font-semibold capitalize">{room.status}</p>
            </div>
          </div>

          {room.amenities && room.amenities.length > 0 && (
            <div className="space-y-3 pt-4 border-t">
              <h3 className="font-semibold">Amenities</h3>
              <div className="flex flex-wrap gap-2">
                {room.amenities.map((amenity: string, i: number) => (
                  <Badge key={i} variant="secondary">{amenity}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-4 border-t">
            <h3 className="font-semibold">Room Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Room Type</p>
                <p className="font-medium">{room.type}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Floor</p>
                <p className="font-medium">{room.floor}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
