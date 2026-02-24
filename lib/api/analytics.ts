'use server'

import { createClient } from '@/lib/supabase/server'

export const analyticsApi = {
  async getDailyRevenue(orgId: string, startDate: string, endDate: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('payments')
      .select('amount, payment_date')
      .eq('organization_id', orgId)
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)
      .order('payment_date', { ascending: true })

    if (error) throw error
    
    // Aggregate by date
    const byDate = new Map<string, number>()
    data?.forEach(payment => {
      const date = payment.payment_date as string
      byDate.set(date, (byDate.get(date) || 0) + (payment.amount || 0))
    })

    return Array.from(byDate.entries()).map(([date, total]) => ({
      date,
      amount: total,
    }))
  },

  async getOccupancyRate(orgId: string, year: number, month: number) {
    const supabase = createClient()
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('check_in_date, check_out_date, room_id')
      .eq('organization_id', orgId)
      .gte('check_in_date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lte('check_out_date', `${year}-${String(month).padStart(2, '0')}-31`)

    if (error) throw error

    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id')
      .eq('organization_id', orgId)

    if (roomsError) throw roomsError

    const totalRoomNights = (rooms?.length || 0) * 30
    const occupiedRoomNights = bookings?.length || 0

    return {
      occupancyRate: totalRoomNights > 0 ? (occupiedRoomNights / totalRoomNights) * 100 : 0,
      totalRoomNights,
      occupiedRoomNights,
    }
  },

  async getRevenueByPaymentMethod(orgId: string, startDate: string, endDate: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('payments')
      .select('method, amount')
      .eq('organization_id', orgId)
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)

    if (error) throw error

    const byMethod = new Map<string, number>()
    data?.forEach(payment => {
      const method = payment.method as string
      byMethod.set(method, (byMethod.get(method) || 0) + (payment.amount || 0))
    })

    return Array.from(byMethod.entries()).map(([method, total]) => ({
      method,
      amount: total,
    }))
  },

  async getTopGuests(orgId: string, limit: number = 10) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('bookings')
      .select('guest_id, guests(full_name, phone), COUNT(*)')
      .eq('organization_id', orgId)
      .order('COUNT(*)', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data
  },
}
