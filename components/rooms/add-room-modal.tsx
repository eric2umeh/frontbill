'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { X } from 'lucide-react'

const availableAmenities = [
  'Jacuzzi',
  'Spacious',
  'Lounge',
  'King Bed',
  'Twin Beds',
  'Balcony',
  'City View',
  'Ocean View',
  'Mini Bar',
  'Smart TV',
  'Work Desk',
  'Sofa',
  'Bathtub',
  'Walk-in Closet',
  'Safe Box',
  'Coffee Maker',
]

interface AddRoomModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddRoomModal({ open, onClose, onSuccess }: AddRoomModalProps) {
  const [formData, setFormData] = useState({
    number: '',
    type: 'deluxe',
    floor: '1',
    capacity: 2,
    rate: 25000,
    status: 'available',
  })
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleAddAmenity = (amenity: string) => {
    if (!selectedAmenities.includes(amenity)) {
      setSelectedAmenities([...selectedAmenities, amenity])
    }
  }

  const handleRemoveAmenity = (amenity: string) => {
    setSelectedAmenities(selectedAmenities.filter(a => a !== amenity))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.number.trim()) {
      toast.error('Please enter room number')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('User not found')
        return
      }

      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (profileError) {
        toast.error(profileError.message || 'Failed to load profile')
        return
      }

      if (!profile?.organization_id) {
        toast.error('No organization linked to account. Please log out and sign up again.')
        return
      }

      // Create room
      const { error } = await supabase
        .from('rooms')
        .insert([{
          organization_id: profile.organization_id,
          room_number: formData.number,
          floor_number: parseInt(formData.floor),
          room_type: formData.type,
          price_per_night: formData.rate,
          max_occupancy: formData.capacity,
          status: formData.status,
          amenities: selectedAmenities,
        }])

      if (error) throw error
      
      toast.success(`Room ${formData.number} added successfully!`)
      
      // Reset form
      setFormData({
        number: '',
        type: 'deluxe',
        floor: '1',
        capacity: 2,
        rate: 25000,
        status: 'available',
      })
      setSelectedAmenities([])
      
      onClose()
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Room</DialogTitle>
          <DialogDescription>Fill in the room details and select amenities</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="number">Room Number *</Label>
              <Input
                id="number"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                placeholder="e.g., 101"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="floor">Floor *</Label>
              <Select value={formData.floor} onValueChange={(value) => setFormData({ ...formData, floor: value })}>
                <SelectTrigger id="floor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Floor 1</SelectItem>
                  <SelectItem value="2">Floor 2</SelectItem>
                  <SelectItem value="3">Floor 3</SelectItem>
                  <SelectItem value="4">Floor 4</SelectItem>
                  <SelectItem value="5">Floor 5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Room Type *</Label>
            <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deluxe">Deluxe</SelectItem>
                <SelectItem value="royal">Royal Suite</SelectItem>
                <SelectItem value="king">King Suite</SelectItem>
                <SelectItem value="mini">Mini Suite</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="diplomatic">Diplomatic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity *</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                max="10"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                placeholder="2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Rate per Night *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">₦</span>
                <Input
                  id="rate"
                  type="number"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: Number(e.target.value) })}
                  placeholder="25,000"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Initial Status *</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="cleaning">Cleaning</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Amenities</Label>
            <Select onValueChange={handleAddAmenity}>
              <SelectTrigger>
                <SelectValue placeholder="Select amenities to add..." />
              </SelectTrigger>
              <SelectContent>
                {availableAmenities
                  .filter(a => !selectedAmenities.includes(a))
                  .map((amenity) => (
                    <SelectItem key={amenity} value={amenity}>
                      {amenity}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            
            {selectedAmenities.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedAmenities.map((amenity) => (
                  <Badge key={amenity} variant="secondary" className="gap-1">
                    {amenity}
                    <button
                      type="button"
                      onClick={() => handleRemoveAmenity(amenity)}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedAmenities.length} amenity selected
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
