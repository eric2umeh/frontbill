'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { AlertCircle, X, ArrowLeft, Edit, Trash2, Users, DollarSign, MapPin } from 'lucide-react'

const ROOM_TYPES = [
  'Deluxe', 'Royal', 'Kings', 'Mini Suite', 'Executive Suite', 'Diplomatic Suite',
]

const AVAILABLE_AMENITIES = [
  'Work Desk', 'Smart TV', 'Jacuzzi', 'Lounge', 'Spacious', 'Sofa',
]

interface Room {
  id: string
  room_number: string
  room_type: string
  floor_number: number
  max_occupancy: number
  price_per_night: number
  status: string
  amenities: string[]
}

export default function RoomDetailPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.id as string
  
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    room_type: '',
    floor_number: '',
    max_occupancy: '',
    price_per_night: '',
    status: 'available',
    amenities: [] as string[],
  })

  useEffect(() => {
    fetchRoom()
  }, [roomId])

  const fetchRoom = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (error) throw error
      if (!data) {
        toast.error('Room not found')
        return
      }

      setRoom(data)
      setFormData({
        room_type: data.room_type || '',
        floor_number: data.floor_number || '',
        max_occupancy: data.max_occupancy || '',
        price_per_night: data.price_per_night || '',
        status: data.status || 'available',
        amenities: data.amenities || [],
      })
    } catch (error: any) {
      console.error('Error fetching room:', error.message)
      toast.error('Failed to load room')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveChanges = async () => {
    try {
      setSaveLoading(true)
      const supabase = createClient()
      
      const { error } = await supabase
        .from('rooms')
        .update({
          room_type: formData.room_type,
          floor_number: parseInt(formData.floor_number as string),
          max_occupancy: parseInt(formData.max_occupancy as string),
          price_per_night: parseFloat(formData.price_per_night as string),
          status: formData.status,
          amenities: formData.amenities,
        })
        .eq('id', roomId)

      if (error) throw error
      
      toast.success('Room details updated successfully')
      setEditModalOpen(false)
      fetchRoom()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update room')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDeleteClick = () => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Delete Room?</p>
              <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.dismiss(t)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteLoading}
              onClick={() => {
                handleDeleteConfirm()
                toast.dismiss(t)
              }}
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      ),
      {
        duration: Infinity,
        className: 'bg-red-50 border-red-200',
      }
    )
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleteLoading(true)
      const supabase = createClient()
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId)

      if (error) throw error
      
      toast.success('Room deleted successfully')
      router.push('/rooms')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete room')
    } finally {
      setDeleteLoading(false)
      setDeleteConfirmId(null)
    }
  }

  const statusColors: { [key: string]: string } = {
    available: 'bg-green-500/10 text-green-700 border-green-200',
    occupied: 'bg-red-500/10 text-red-700 border-red-200',
    cleaning: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    maintenance: 'bg-orange-500/10 text-orange-700 border-orange-200',
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading room details...</p>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Room not found</p>
          <Button onClick={() => router.push('/rooms')} className="mt-4">
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
              <Label>Room Type</Label>
              <Select value={formData.room_type} onValueChange={(value) => setFormData({ ...formData, room_type: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map(rt => (
                    <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Select value={String(formData.floor_number)} onValueChange={(value) => setFormData({ ...formData, floor_number: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Floor 1</SelectItem>
                  <SelectItem value="2">Floor 2</SelectItem>
                  <SelectItem value="3">Floor 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Capacity</Label>
              <Input
                type="number"
                value={formData.max_occupancy}
                onChange={(e) => setFormData({ ...formData, max_occupancy: e.target.value })}
                placeholder="e.g., 2"
              />
            </div>
            <div className="space-y-2">
              <Label>Rate Per Night (₦)</Label>
              <Input
                type="number"
                value={formData.price_per_night}
                onChange={(e) => setFormData({ ...formData, price_per_night: e.target.value })}
                placeholder="e.g., 25000"
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
              <Label>Amenities</Label>
              <Select onValueChange={(val) => {
                if (!formData.amenities.includes(val)) {
                  setFormData({ ...formData, amenities: [...formData.amenities, val] })
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Add amenity..." />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_AMENITIES.filter(a => !formData.amenities.includes(a)).map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.amenities.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.amenities.map(a => (
                    <Badge key={a} variant="secondary" className="gap-1">
                      {a}
                      <button type="button" onClick={() => setFormData({ ...formData, amenities: formData.amenities.filter(x => x !== a) })} className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleSaveChanges} className="w-full" disabled={saveLoading}>
              {saveLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/rooms')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Rooms
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteClick}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-3xl">Room {room.room_number}</CardTitle>
              <p className="text-muted-foreground mt-1">{room.room_type}</p>
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
              <p className="font-semibold">Floor {room.floor_number}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="text-sm">Capacity</span>
              </div>
              <p className="font-semibold">{room.max_occupancy} guests</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm">Rate/Night</span>
              </div>
              <p className="font-semibold">{formatNaira(room.price_per_night)}</p>
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
                <p className="font-medium">{room.room_type}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Floor</p>
                <p className="font-medium">{room.floor_number}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
