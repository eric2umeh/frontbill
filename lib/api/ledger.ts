'use server'

import { createClient } from '@/lib/supabase/server'

export const ledgerApi = {
  async getLedgerAccounts(orgId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('city_ledger_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  async createLedgerAccount(orgId: string, account: any) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('city_ledger_accounts')
      .insert({
        ...account,
        organization_id: orgId,
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateLedgerAccount(accountId: string, updates: any) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('city_ledger_accounts')
      .update(updates)
      .eq('id', accountId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async deleteLedgerAccount(accountId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('city_ledger_accounts')
      .delete()
      .eq('id', accountId)

    if (error) throw error
  },

  async addPaymentToLedger(orgId: string, accountId: string, payment: any) {
    const supabase = createClient()
    
    // Update the account balance
    const { data: account, error: fetchError } = await supabase
      .from('city_ledger_accounts')
      .select('balance')
      .eq('id', accountId)
      .single()

    if (fetchError) throw fetchError

    const newBalance = (account?.balance || 0) + payment.amount
    const { error: updateError } = await supabase
      .from('city_ledger_accounts')
      .update({ balance: newBalance })
      .eq('id', accountId)

    if (updateError) throw updateError

    // Create transaction record
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        organization_id: orgId,
        type: 'income',
        amount: payment.amount,
        description: `City Ledger: ${payment.description}`,
        category: 'city_ledger',
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getLedgerReport(orgId: string, startDate: string, endDate: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('city_ledger_accounts')
      .select('id, name, balance')
      .eq('organization_id', orgId)

    if (error) throw error

    const totalBalance = data?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0

    return {
      accounts: data,
      totalBalance,
      periodStart: startDate,
      periodEnd: endDate,
    }
  },
}
