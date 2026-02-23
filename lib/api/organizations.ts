'use server'

import { createClient } from '@/lib/supabase/server'

export const organizationsApi = {
  async getOrganization(orgId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()

    if (error) throw error
    return data
  },

  async updateOrganization(orgId: string, updates: any) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getSettings(orgId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('email, phone, address, city, country')
      .eq('id', orgId)
      .single()

    if (error) throw error
    return data
  },

  async updateSettings(orgId: string, settings: any) {
    return this.updateOrganization(orgId, settings)
  },
}
