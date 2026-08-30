import type { SupabaseClient } from '@supabase/supabase-js'

/** Optional columns added in scripts/057 and scripts/058 — staging may lag behind app code. */
const OPTIONAL_MENU_COLUMNS = ['price_editable'] as const

export function isMissingOptionalMenuColumnError(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    msg.includes('schema cache') &&
    OPTIONAL_MENU_COLUMNS.some((col) => msg.includes(col.toLowerCase()))
  )
}

export function omitOptionalMenuColumns<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload }
  for (const col of OPTIONAL_MENU_COLUMNS) {
    delete next[col]
  }
  return next
}

type AdminClient = SupabaseClient

export async function insertOutletMenuItem(
  admin: AdminClient,
  payload: Record<string, unknown>,
) {
  let result = await admin.from('outlet_menu_items').insert(payload).select().single()
  if (
    result.error &&
    isMissingOptionalMenuColumnError(result.error.message) &&
    OPTIONAL_MENU_COLUMNS.some((col) => col in payload)
  ) {
    result = await admin
      .from('outlet_menu_items')
      .insert(omitOptionalMenuColumns(payload))
      .select()
      .single()
  }
  return result
}

export async function updateOutletMenuItem(
  admin: AdminClient,
  id: string,
  patch: Record<string, unknown>,
  organizationId?: string,
) {
  let query = admin.from('outlet_menu_items').update(patch).eq('id', id)
  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }
  let result = await query.select().single()
  if (
    result.error &&
    isMissingOptionalMenuColumnError(result.error.message) &&
    OPTIONAL_MENU_COLUMNS.some((col) => col in patch)
  ) {
    let retry = admin.from('outlet_menu_items').update(omitOptionalMenuColumns(patch)).eq('id', id)
    if (organizationId) {
      retry = retry.eq('organization_id', organizationId)
    }
    result = await retry.select().single()
  }
  return result
}

export async function insertOutletMenuCategory(
  admin: AdminClient,
  payload: Record<string, unknown>,
) {
  let result = await admin.from('outlet_menu_categories').insert(payload).select().single()
  if (
    result.error &&
    isMissingOptionalMenuColumnError(result.error.message) &&
    OPTIONAL_MENU_COLUMNS.some((col) => col in payload)
  ) {
    result = await admin
      .from('outlet_menu_categories')
      .insert(omitOptionalMenuColumns(payload))
      .select()
      .single()
  }
  return result
}

export async function updateOutletMenuCategory(
  admin: AdminClient,
  id: string,
  patch: Record<string, unknown>,
) {
  let result = await admin
    .from('outlet_menu_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (
    result.error &&
    isMissingOptionalMenuColumnError(result.error.message) &&
    OPTIONAL_MENU_COLUMNS.some((col) => col in patch)
  ) {
    result = await admin
      .from('outlet_menu_categories')
      .update(omitOptionalMenuColumns(patch))
      .eq('id', id)
      .select()
      .single()
  }
  return result
}
