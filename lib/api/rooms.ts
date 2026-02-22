'use server'

import { createClient } from '@/lib/supabase/server'

export async function getRooms(organizationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('organization_id', organizationId)
    .order('room_number', { ascending: true })

  if (error) throw new Error(error.message)
  return data
}

export async function getAvailableRooms(organizationId: string, checkIn: string, checkOut: string) {
  const supabase = createClient()
  
  // Get all rooms
  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('organization_id', organizationId)

  if (roomsError) throw new Error(roomsError.message)

  // Get bookings that overlap with the dates
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('room_id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .lt('check_out', checkOut)
    .gt('check_in', checkIn)

  if (bookingsError) throw new Error(bookingsError.message)

  const bookedRoomIds = new Set(bookings?.map(b => b.room_id))
  const availableRooms = rooms?.filter(r => !bookedRoomIds.has(r.id)) || []

  return availableRooms
}

export async function getRoomById(roomId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function createRoom(room: {
  organization_id: string
  room_number: string
  floor_number: number
  room_type: string
  price_per_night: number
  max_occupancy: number
  amenities?: string[]
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rooms')
    .insert([room])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateRoom(roomId: string, updates: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', roomId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateRoomStatus(roomId: string, status: 'available' | 'occupied' | 'maintenance' | 'blocked') {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rooms')
    .update({ status })
    .eq('id', roomId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getRoomStatistics(organizationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('rooms')
    .select('status, COUNT(*) as count')
    .eq('organization_id', organizationId)
    .group_by('status')

  if (error) throw new Error(error.message)

  const stats = {
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
    blocked: 0,
  }

  data?.forEach(item => {
    stats[item.status as keyof typeof stats] = item.count
    stats.total += item.count
  })

  return stats
}
