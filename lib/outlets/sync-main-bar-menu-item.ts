import type { SupabaseClient } from '@supabase/supabase-js'
import { outletSlugify } from '@/lib/outlets/slug'
import { canonicalBarStockId } from '@/lib/supply-chain/bar-stock-normalize'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'

type MenuCategoryRow = { id: string; name: string; slug: string }
type MenuItemRow = {
  id: string
  name: string
  service_code: string | null
  category_id: string | null
  is_active: boolean
  unit_price?: number
}

export type SyncMainBarMenuItemInput = {
  organizationId: string
  userId: string
  storeItemId: string
  itemName: string
  unitPrice: number
  unit?: string
  categoryName?: string
}

export type SyncMainBarMenuItemResult =
  | { synced: 'created' | 'updated' | 'skipped'; itemId?: string }
  | { error: string }

async function resolveDefaultCategoryId(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
  categories: MenuCategoryRow[],
  requestedName?: string,
): Promise<string | null> {
  const categoryName = toTitleCaseWords(requestedName?.trim() || 'Beverages')
  const categoryNorm = categoryName.toLowerCase()
  const slug = outletSlugify(categoryName)
  const existing =
    categories.find((c) => c.name.trim().toLowerCase() === categoryNorm)?.id ??
    categories.find((c) => String(c.slug || '') === slug)?.id ??
    null
  if (existing) return existing

  const { data: created, error: ce } = await admin
    .from('outlet_menu_categories')
    .insert({
      organization_id: organizationId,
      department: 'main_bar',
      name: categoryName,
      slug,
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, name, slug')
    .single()

  if (ce) {
    const isDup =
      ce.code === '23505' ||
      /outlet_menu_categories_organization_id_department_slug/i.test(ce.message || '')
    if (!isDup) return null
    const { data: raced } = await admin
      .from('outlet_menu_categories')
      .select('id, name, slug')
      .eq('organization_id', organizationId)
      .eq('department', 'main_bar')
      .eq('slug', slug)
      .maybeSingle()
    return raced?.id ?? null
  }

  if (created) {
    categories.push(created as MenuCategoryRow)
  }
  return created?.id ?? null
}

/** Upsert one Main Bar menu row from a central-store catalogue item (qty stays in bar stock). */
export async function syncMainBarMenuItemFromStore(
  admin: SupabaseClient,
  input: SyncMainBarMenuItemInput,
  ctx: {
    categories: MenuCategoryRow[]
    existingItems: MenuItemRow[]
  },
): Promise<SyncMainBarMenuItemResult> {
  const itemName = input.itemName.trim()
  if (!itemName) return { error: 'Item name required' }

  const barStockId = canonicalBarStockId(input.storeItemId)
  const serviceCode = `bar:${barStockId}`
  const unitPrice = Number.isFinite(input.unitPrice) && input.unitPrice >= 0 ? input.unitPrice : 0
  const nameNorm = itemName.toLowerCase()

  const matchingByName =
    ctx.existingItems.filter((i) => i.name.trim().toLowerCase() === nameNorm) ?? []
  const existing =
    ctx.existingItems.find((i) => i.service_code === serviceCode) ?? matchingByName[0]

  if (existing && !existing.is_active) {
    return { synced: 'skipped', itemId: existing.id }
  }

  let categoryId: string | null = existing?.category_id ?? null
  if (!categoryId) {
    categoryId = await resolveDefaultCategoryId(
      admin,
      input.organizationId,
      input.userId,
      ctx.categories,
      input.categoryName,
    )
  }

  // Outlet menu price is the POS selling price — store lastPrice only seeds new or unset rows.
  const seedPriceFromStore =
    !existing?.is_active || Number(existing.unit_price) === 0

  if (existing?.is_active) {
    const nameMatches = existing.name.trim().toLowerCase() === nameNorm
    const codeMatches = existing.service_code === serviceCode
    const hasCategory = Boolean(categoryId)
    if (nameMatches && codeMatches && hasCategory) {
      return { synced: 'skipped', itemId: existing.id }
    }
  }

  const itemPayload: Record<string, unknown> = {
    name: itemName,
    category_id: categoryId,
    service_code: serviceCode,
    is_active: true,
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
  }
  if (seedPriceFromStore) {
    itemPayload.unit_price = unitPrice
  }

  if (existing) {
    const { data: updated, error: ue } = await admin
      .from('outlet_menu_items')
      .update(itemPayload)
      .eq('id', existing.id)
      .select('id')
      .single()
    if (ue) return { error: ue.message }

    const duplicateIds = matchingByName
      .map((i) => i.id)
      .filter((id) => id !== existing.id)
    if (duplicateIds.length) {
      await admin
        .from('outlet_menu_items')
        .update({
          is_active: false,
          updated_by: input.userId,
          updated_at: new Date().toISOString(),
        })
        .in('id', duplicateIds)
    }

    existing.name = itemName
    existing.service_code = serviceCode
    existing.category_id = categoryId
    if (seedPriceFromStore) existing.unit_price = unitPrice
    existing.is_active = true
    return { synced: 'updated', itemId: updated?.id ?? existing.id }
  }

  const { data: created, error: ie } = await admin
    .from('outlet_menu_items')
    .insert({
      organization_id: input.organizationId,
      department: 'main_bar',
      category_id: categoryId,
      name: itemName,
      description: '',
      unit_price: unitPrice,
      service_code: serviceCode,
      is_active: true,
      sort_order: 0,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select('id, name, service_code, category_id, is_active')
    .single()

  if (ie) {
    const isDup =
      ie.code === '23505' || /duplicate key|unique constraint/i.test(ie.message || '')
    if (!isDup) return { error: ie.message }
    const { data: racedItem } = await admin
      .from('outlet_menu_items')
      .select('id, name, service_code, category_id, is_active, unit_price')
      .eq('organization_id', input.organizationId)
      .eq('department', 'main_bar')
      .eq('service_code', serviceCode)
      .maybeSingle()
    if (!racedItem) return { error: ie.message }
    if (!racedItem.is_active) return { synced: 'skipped', itemId: racedItem.id }
    const racePayload = { ...itemPayload }
    if (Number(racedItem.unit_price) === 0 && unitPrice > 0) {
      racePayload.unit_price = unitPrice
    }
    const { error: ue } = await admin
      .from('outlet_menu_items')
      .update(racePayload)
      .eq('id', racedItem.id)
    if (ue) return { error: ue.message }
    return { synced: 'updated', itemId: racedItem.id }
  }

  if (created) {
    ctx.existingItems.push(created as MenuItemRow)
  }
  return { synced: 'created', itemId: created?.id }
}
