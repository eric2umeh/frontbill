'use server'

import { createClient } from '@/lib/supabase/server'

export async function getGuests(organizationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getGuestById(guestId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('id', guestId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function createGuest(guest: {
  organization_id: string
  name: string
  email?: string
  phone?: string
  id_type?: string
  id_number?: string
  address?: string
  city?: string
  country?: string
  date_of_birth?: string
  notes?: string
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('guests')
    .insert([guest])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateGuest(guestId: string, updates: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('guests')
    .update(updates)
    .eq('id', guestId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function searchGuests(organizationId: string, query: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('organization_id', organizationId)
    .or(`name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10)

  if (error) throw new Error(error.message)
  return data
}

export async function getGuestBookings(guestId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      room:rooms(*)
    `)
    .eq('guest_id', guestId)
    .order('check_in', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}
