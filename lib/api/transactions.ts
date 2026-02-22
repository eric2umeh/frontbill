import { createClient } from './supabase-client'

export const transactionsApi = {
  async getTransactions(orgId: string, options?: { limit?: number; offset?: number }) {
    const supabase = createClient()
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (options?.limit) {
      query = query.limit(options.limit)
    }
    if (options?.offset) {
      query = query.offset(options.offset)
    }

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async createTransaction(orgId: string, transaction: any) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        ...transaction,
        organization_id: orgId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateTransaction(transactionId: string, updates: any) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', transactionId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteTransaction(transactionId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)

    if (error) throw error
  },

  async getTransactionsByType(orgId: string, type: 'income' | 'expense') {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('organization_id', orgId)
      .eq('type', type)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  async getTotalByType(orgId: string, type: 'income' | 'expense') {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('type', type)

    if (error) throw error

    const total = data?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0
    return total
  },
}

function createClient() {
  return null as any
}
