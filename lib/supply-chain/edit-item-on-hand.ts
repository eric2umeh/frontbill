import { isCompleteQuantityInput, parseQuantityInput } from './measurement-units'

/**
 * On-hand quantity from the Edit store item field.
 * Undefined means "do not write quantity_in_store":
 * the field was left blank, is incomplete, is invalid, or still matches
 * the quantity the dialog opened with.
 * An explicit 0 is a real count and is returned.
 */
export function quantityInStoreFromEditForm(
  raw: string,
  baseline: number,
): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (!isCompleteQuantityInput(trimmed)) return undefined
  const parsed = parseQuantityInput(trimmed)
  if (parsed == null || !Number.isFinite(parsed.quantity) || parsed.quantity < 0) {
    return undefined
  }
  const baseN = Number(baseline)
  const baselineQty = Number.isFinite(baseN) ? Math.max(0, baseN) : 0
  if (parsed.quantity === baselineQty) return undefined
  return parsed.quantity
}

/** Finite non-negative on-hand override, or null when the edit did not set one. */
export function explicitStoreOnHandQty(
  quantityInStore: number | null | undefined,
): number | null {
  if (quantityInStore == null) return null
  const n = Number(quantityInStore)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

/**
 * Drop quantityInStore from a catalogue PATCH unless this edit explicitly set it.
 * A full-item save otherwise writes the browser's on-hand figure and undoes
 * receipts or issue-outs that landed while the dialog was open.
 */
export function catalogPatchPreservingOnHand<T extends { quantityInStore?: number }>(
  patch: T,
  explicitQty: number | null,
): T {
  if (explicitQty != null) return patch
  const next = { ...patch }
  delete next.quantityInStore
  return next
}
