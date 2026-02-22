'use server'

import { createClient } from '@/lib/supabase/server'

export async function getBookings(organizationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      guest:guests(*),
      room:rooms(*)
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getBookingById(bookingId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      guest:guests(*),
      room:rooms(*),
      payments:payments(*)
    `)
    .eq('id', bookingId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function createBooking(booking: {
  organization_id: string
  guest_id: string
  room_id: string
  folio_id: string
  check_in: string
  check_out: string
  number_of_nights: number
  rate_per_night: number
  total_amount: number
  deposit?: number
  payment_status?: string
  notes?: string
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .insert([booking])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateBooking(
  bookingId: string,
  updates: Record<string, any>
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function extendStay(
  bookingId: string,
  newCheckOut: string,
  additionalAmount: number,
  paymentMethod: string
) {
  const supabase = createClient()
  
  // Update booking
  const { data: booking, error: updateError } = await supabase
    .from('bookings')
    .update({
      check_out: newCheckOut,
      total_amount: supabase.rpc('coalesce').then(x => x), // Will be calculated
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single()

  if (updateError) throw new Error(updateError.message)

  // Create payment record
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert([{
      booking_id: bookingId,
      amount: additionalAmount,
      payment_method: paymentMethod,
      payment_date: new Date().toISOString(),
    }])
    .select()
    .single()

  if (paymentError) throw new Error(paymentError.message)

  return { booking, payment }
}

export async function deleteBooking(bookingId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)

  if (error) throw new Error(error.message)
}
