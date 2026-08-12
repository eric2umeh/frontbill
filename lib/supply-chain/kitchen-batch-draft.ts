import type { KitchenBatchDraft } from './types'

export const KITCHEN_BATCH_DRAFT_KEY = 'frontbill_kitchen_batch_draft'
export const KITCHEN_BATCH_DRAFT_EDIT_PREFIX = 'frontbill_kitchen_batch_draft:edit:'
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

/** New-batch draft uses the base key; edit drafts are scoped per recipe id. */
export function kitchenBatchDraftKey(editRecipeId?: string | null): string {
  if (editRecipeId) return `${KITCHEN_BATCH_DRAFT_EDIT_PREFIX}${editRecipeId}`
  return KITCHEN_BATCH_DRAFT_KEY
}

function parseDraft(raw: string): KitchenBatchDraft {
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
}

export function loadKitchenBatchDraft(editRecipeId?: string | null): KitchenBatchDraft {
  if (typeof window === 'undefined') return { ...EMPTY_KITCHEN_BATCH_DRAFT }
  const key = kitchenBatchDraftKey(editRecipeId)
  try {
    const raw =
      window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
    if (!raw) return { ...EMPTY_KITCHEN_BATCH_DRAFT }
    return parseDraft(raw)
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
  opts?: { force?: boolean; editRecipeId?: string | null },
) {
  if (typeof window === 'undefined') return
  const key = kitchenBatchDraftKey(opts?.editRecipeId)
  try {
    if (!opts?.force && !kitchenBatchDraftHasContent(draft)) {
      const existing = loadKitchenBatchDraft(opts?.editRecipeId)
      if (kitchenBatchDraftHasContent(existing)) return
    }
    const json = JSON.stringify(draft)
    window.localStorage.setItem(key, json)
    window.sessionStorage.setItem(key, json)
  } catch {
    /* ignore */
  }
}

export function clearKitchenBatchDraft(editRecipeId?: string | null) {
  if (typeof window === 'undefined') return
  const key = kitchenBatchDraftKey(editRecipeId)
  try {
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Clears new-batch and all edit-batch drafts (e.g. kitchen wipe / logout). */
export function clearAllKitchenBatchDrafts() {
  if (typeof window === 'undefined') return
  try {
    const storages = [window.localStorage, window.sessionStorage]
    for (const storage of storages) {
      const toRemove: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (
          key === KITCHEN_BATCH_DRAFT_KEY ||
          key?.startsWith(KITCHEN_BATCH_DRAFT_EDIT_PREFIX)
        ) {
          toRemove.push(key)
        }
      }
      for (const key of toRemove) storage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}
