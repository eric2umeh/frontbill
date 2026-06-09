import type { KitchenBatchDraft } from './types'

export const KITCHEN_BATCH_DRAFT_KEY = 'frontbill_kitchen_batch_draft'

export const EMPTY_KITCHEN_BATCH_DRAFT: KitchenBatchDraft = {
  search: '',
  menuCategory: '',
  menuCategoryId: null,
  batchName: '',
  menuItemId: null,
  linkedKitchenStockId: null,
  plannedPortions: '4',
  sellingPrice: '',
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
    return {
      ...EMPTY_KITCHEN_BATCH_DRAFT,
      ...parsed,
      menuCategory: parsed.menuCategory ?? '',
      menuCategoryId: parsed.menuCategoryId ?? null,
      menuItemId: parsed.menuItemId ?? null,
      linkedKitchenStockId: parsed.linkedKitchenStockId ?? null,
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
    }
  } catch {
    return { ...EMPTY_KITCHEN_BATCH_DRAFT }
  }
}

export function persistKitchenBatchDraft(draft: KitchenBatchDraft) {
  if (typeof window === 'undefined') return
  try {
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
