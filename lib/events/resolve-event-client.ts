import type { SupabaseClient } from '@supabase/supabase-js'
import { guestOrOrganizationNameTaken } from '@/lib/utils/guest-org-name-uniqueness'
import { formatPersonName } from '@/lib/utils/name-format'

export type EventClientType = 'guest' | 'organization'

export type ResolveEventClientInput = {
  hotelOrganizationId: string
  userId: string
  clientType: EventClientType
  clientName: string
  clientPhone?: string | null
  clientEmail?: string | null
  clientAddress?: string | null
  guestId?: string | null
  clientOrganizationId?: string | null
  orgType?: string | null
  contactPerson?: string | null
}

export type ResolvedEventClient = {
  client_type: EventClientType
  client_name: string
  client_phone: string | null
  client_email: string | null
  guest_id: string | null
  client_organization_id: string | null
}

export async function resolveEventClientRecord(
  admin: SupabaseClient,
  input: ResolveEventClientInput,
): Promise<{ data: ResolvedEventClient } | { error: string }> {
  const name = String(input.clientName || '').trim()
  const phone = String(input.clientPhone || '').trim() || null
  const email = String(input.clientEmail || '').trim() || null
  const address = String(input.clientAddress || '').trim() || null

  if (!name) {
    return { error: 'Client name is required' }
  }

  if (input.clientType === 'guest') {
    const guestId = String(input.guestId || '').trim()
    if (guestId) {
      const { data: g, error } = await admin
        .from('guests')
        .select('id, name, phone, email, organization_id')
        .eq('id', guestId)
        .single()
      if (error || !g || g.organization_id !== input.hotelOrganizationId) {
        return { error: 'Guest not found' }
      }
      return {
        data: {
          client_type: 'guest',
          client_name: g.name,
          client_phone: g.phone || phone,
          client_email: g.email || email,
          guest_id: g.id,
          client_organization_id: null,
        },
      }
    }

    const formattedName = formatPersonName(name)
    const taken = await guestOrOrganizationNameTaken(admin, {
      hotelTenantOrganizationId: input.hotelOrganizationId,
      candidateName: formattedName,
    })
    if (taken) {
      return { error: 'This name is already used by a guest or organization' }
    }

    const { data: created, error: insErr } = await admin
      .from('guests')
      .insert({
        organization_id: input.hotelOrganizationId,
        name: formattedName,
        phone,
        email,
        address,
      })
      .select('id, name, phone, email')
      .single()

    if (insErr) return { error: insErr.message }

    const { data: ledgerExists } = await admin
      .from('city_ledger_accounts')
      .select('id')
      .eq('organization_id', input.hotelOrganizationId)
      .ilike('account_name', formattedName)
      .maybeSingle()
    if (!ledgerExists) {
      await admin.from('city_ledger_accounts').insert({
        organization_id: input.hotelOrganizationId,
        account_name: formattedName,
        account_type: 'individual',
        contact_phone: phone,
        contact_email: email,
        balance: 0,
      })
    }

    return {
      data: {
        client_type: 'guest',
        client_name: created.name,
        client_phone: created.phone,
        client_email: created.email,
        guest_id: created.id,
        client_organization_id: null,
      },
    }
  }

  const orgId = String(input.clientOrganizationId || '').trim()
  if (orgId) {
    const { data: o, error } = await admin
      .from('organizations')
      .select('id, name, phone, email, org_type')
      .eq('id', orgId)
      .single()
    if (error || !o || !o.org_type) {
      return { error: 'Organization not found' }
    }
    return {
      data: {
        client_type: 'organization',
        client_name: o.name,
        client_phone: o.phone || phone,
        client_email: o.email || email,
        guest_id: null,
        client_organization_id: o.id,
      },
    }
  }

  const taken = await guestOrOrganizationNameTaken(admin, {
    hotelTenantOrganizationId: input.hotelOrganizationId,
    candidateName: name,
  })
  if (taken) {
    return { error: 'This name is already used by a guest or organization' }
  }

  const { data: created, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: name.trim(),
      org_type: String(input.orgType || 'other').trim() || 'other',
      email: email,
      phone,
      address,
      contact_person: String(input.contactPerson || '').trim() || null,
      current_balance: 0,
      created_by: input.userId,
    })
    .select('id, name, phone, email')
    .single()

  if (orgErr) return { error: orgErr.message }

  const { data: orgLedgerExists } = await admin
    .from('city_ledger_accounts')
    .select('id')
    .eq('organization_id', input.hotelOrganizationId)
    .ilike('account_name', created.name)
    .maybeSingle()
  if (!orgLedgerExists) {
    await admin.from('city_ledger_accounts').insert({
      organization_id: input.hotelOrganizationId,
      account_name: created.name,
      account_type: 'organization',
      contact_phone: phone,
      contact_email: email,
      balance: 0,
    })
  }

  return {
    data: {
      client_type: 'organization',
      client_name: created.name,
      client_phone: created.phone,
      client_email: created.email,
      guest_id: null,
      client_organization_id: created.id,
    },
  }
}
