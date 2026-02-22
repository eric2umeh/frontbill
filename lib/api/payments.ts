'use server'

import { createClient } from '@/lib/supabase/server'

export async function getPayments(organizationId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      booking:bookings(folio_id, guest_id),
      guest:guests(name)
    `)
    .eq('organization_id', organizationId)
    .order('payment_date', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getPaymentsByDate(organizationId: string, date: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payments')
    .select(`
      *,
      booking:bookings(folio_id),
      guest:guests(name)
    `)
    .eq('organization_id', organizationId)
    .gte('payment_date', `${date}T00:00:00`)
    .lt('payment_date', `${date}T23:59:59`)
    .order('payment_date', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getPaymentsByBooking(bookingId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('payment_date', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function createPayment(payment: {
  organization_id: string
  booking_id?: string
  guest_id?: string
  amount: number
  payment_method: string
  reference_number?: string
  notes?: string
}) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      ...payment,
      payment_date: new Date().toISOString(),
    }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updatePayment(paymentId: string, updates: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payments')
    .update(updates)
    .eq('id', paymentId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getDailyRevenue(organizationId: string, date: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('payments')
    .select('amount, payment_method')
    .eq('organization_id', organizationId)
    .gte('payment_date', `${date}T00:00:00`)
    .lt('payment_date', `${date}T23:59:59`)

  if (error) throw new Error(error.message)

  const total = data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
  const byMethod = data?.reduce((acc: Record<string, number>, p) => {
    const method = p.payment_method || 'unknown'
    acc[method] = (acc[method] || 0) + (p.amount || 0)
    return acc
  }, {}) || {}

  return { total, byMethod }
}
