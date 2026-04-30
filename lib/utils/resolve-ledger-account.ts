export async function resolveOrganizationLedgerAccount(supabase: any, organizationId: string, account: any) {
  if (!account) return null
  if (account.source === 'city_ledger') return account

  const accountName = account.account_name || account.name
  if (!accountName) return null

  const { data: existing, error: existingError } = await supabase
    .from('city_ledger_accounts')
    .select('id, account_name, account_type, contact_phone, balance')
    .eq('organization_id', organizationId)
    .ilike('account_name', accountName)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing) {
    return {
      ...existing,
      name: existing.account_name,
      source: 'city_ledger',
    }
  }

  const { data: created, error } = await supabase
    .from('city_ledger_accounts')
    .insert([{
      organization_id: organizationId,
      account_name: accountName,
      account_type: 'organization',
      contact_phone: account.phone || account.contact_phone || null,
      balance: 0,
    }])
    .select('id, account_name, account_type, contact_phone, balance')
    .single()

  if (error) throw error

  return {
    ...created,
    name: created.account_name,
    source: 'city_ledger',
  }
}
