import type { KitchenBatchDraft } from './types'

export const KITCHEN_BATCH_DRAFT_KEY = 'frontbill_kitchen_batch_draft'
export const KITCHEN_BATCH_DRAFT_VERSION = 2

function normalizeDraftNumeric(value: unknown): string {
  if (value == null || value === '' || value === '0' || value === 0) return ''
  return String(value)
}

export const EMPTY_KITCHEN_BATCH_DRAFT: KitchenBatchDraft = {
  draftVersion: KITCHEN_BATCH_DRAFT_VERSION,
  search: '',
  menuCategory: '',
  menuCategoryId: null,
  batchName: '',
  menuItemId: null,
  linkedKitchenStockId: null,
  plannedPortions: '',
  yieldUnit: 'portion',
  sellingPrice: '',
  overheadLabour: '',
  overheadGas: '',
  overheadOther: '',
  outletMenuSync: 'none' as const,
  notes: '',
  cart: [],
}

export function loadKitchenBatchDraft(): KitchenBatchDraft {
  if (typeof window === 'undefined') return { ...EMPTY_KITCHEN_BATCH_DRAFT }
  try {
    const raw =
      window.localStorage.getItem(KITCHEN_BATCH_DRAFT_KEY) ??
      window.sessionStorage.getItem(KITCHEN_BATCH_DRAFT_KEY)
    if (!raw) return { ...EMPTY_KITCHEN_BATCH_DRAFT }
    const parsed = JSON.parse(raw) as Partial<KitchenBatchDraft>
    const version = parsed.draftVersion ?? 1
    const legacyNumeric = version < KITCHEN_BATCH_DRAFT_VERSION
    return {
      draftVersion: KITCHEN_BATCH_DRAFT_VERSION,
      search: parsed.search ?? '',
      menuCategory: parsed.menuCategory ?? '',
      menuCategoryId: parsed.menuCategoryId ?? null,
      batchName: parsed.batchName ?? '',
      menuItemId: parsed.menuItemId ?? null,
      linkedKitchenStockId: parsed.linkedKitchenStockId ?? null,
      plannedPortions: legacyNumeric ? '' : normalizeDraftNumeric(parsed.plannedPortions),
      yieldUnit: parsed.yieldUnit ?? 'portion',
      sellingPrice: legacyNumeric ? '' : normalizeDraftNumeric(parsed.sellingPrice),
      overheadLabour: legacyNumeric ? '' : normalizeDraftNumeric(parsed.overheadLabour),
      overheadGas: legacyNumeric ? '' : normalizeDraftNumeric(parsed.overheadGas),
      overheadOther: legacyNumeric ? '' : normalizeDraftNumeric(parsed.overheadOther),
      outletMenuSync:
        (parsed.outletMenuSync as KitchenBatchDraft['outletMenuSync']) ??
        (parsed.fnbEligible ? 'restaurant_fnb' : 'none'),
      notes: parsed.notes ?? '',
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
    }
  } catch {
    return { ...EMPTY_KITCHEN_BATCH_DRAFT }
  }
}

export function kitchenBatchDraftHasContent(draft: KitchenBatchDraft): boolean {
  return (
    draft.cart.length > 0 ||
    draft.batchName.trim().length > 0 ||
    draft.menuCategory.trim().length > 0 ||
    draft.plannedPortions.trim().length > 0 ||
    draft.sellingPrice.trim().length > 0 ||
    draft.notes.trim().length > 0
  )
}

export function persistKitchenBatchDraft(
  draft: KitchenBatchDraft,
  opts?: { force?: boolean },
) {
  if (typeof window === 'undefined') return
  try {
    if (!opts?.force && !kitchenBatchDraftHasContent(draft)) {
      const existing = loadKitchenBatchDraft()
      if (kitchenBatchDraftHasContent(existing)) return
    }
    const json = JSON.stringify(draft)
    window.localStorage.setItem(KITCHEN_BATCH_DRAFT_KEY, json)
    window.sessionStorage.setItem(KITCHEN_BATCH_DRAFT_KEY, json)
  } catch {
    /* ignore */
  }
}

export function clearKitchenBatchDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KITCHEN_BATCH_DRAFT_KEY)
    window.sessionStorage.removeItem(KITCHEN_BATCH_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}
