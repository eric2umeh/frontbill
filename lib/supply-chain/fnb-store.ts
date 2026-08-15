import type {
  FnbDailySheet,
  FnbDailySheetLine,
  FnbDrinkCategory,
  FnbMovement,
  FnbRawStockItem,
  IssueOutRecord,
} from '@/lib/supply-chain/types'

export const FNB_DEFAULT_DRINK_CATEGORIES = [
  'Wine',
  'Champagne',
  'Spirits',
  'Beer',
  'Soft Drink',
  'Cocktail',
  'Malt',
  'Water',
] as const

export function formatSupplyActorStamp(name: string, at?: string | Date): string {
  const d = at ? new Date(at) : new Date()
  if (!Number.isFinite(d.getTime())) return name
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${name} · ${date} ${time}`
}

export function localYmd(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isoToLocalYmd(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 10)
  return localYmd(d)
}

export function isFnbStoreDestination(destination: string): boolean {
  const d = destination.trim().toLowerCase()
  return (
    d === 'f&b store' ||
    d === 'fnb store' ||
    d === 'food & beverage' ||
    d === 'food and beverage' ||
    (d.includes('fnb') && d.includes('store')) ||
    (d.includes('f&b') && d.includes('store'))
  )
}

export function issueCreditsFnbStore(destination: string): boolean {
  const d = destination.trim().toLowerCase()
  return (
    isFnbStoreDestination(destination) ||
    d === 'restaurant' ||
    d.includes('fnb') ||
    d.includes('food')
  )
}

export function previousCalendarYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  dt.setDate(dt.getDate() - 1)
  return localYmd(dt)
}

export function fnbSheetClosing(
  line: Pick<
    FnbDailySheetLine,
    'opening' | 'newQty' | 'complimentary' | 'soldQty' | 'damage' | 'toMainBar'
  >,
): number {
  const total = Math.max(0, line.opening) + Math.max(0, line.newQty)
  const out =
    Math.max(0, line.complimentary) +
    Math.max(0, line.soldQty) +
    Math.max(0, line.damage) +
    Math.max(0, line.toMainBar)
  return Math.max(0, total - out)
}

export function fnbSheetAmount(soldQty: number, unitPrice: number): number {
  const q = Math.max(0, soldQty)
  const p = Math.max(0, unitPrice)
  return Math.round(q * p * 100) / 100
}

export function newQtyFromIssueLog(
  storeItemId: string,
  ymd: string,
  issueOutLog: IssueOutRecord[],
): number {
  return issueOutLog.reduce((sum, rec) => {
    if (rec.storeItemId !== storeItemId) return sum
    if (!issueCreditsFnbStore(rec.destination)) return sum
    if (isoToLocalYmd(rec.issuedAt || '') !== ymd) return sum
    return sum + (Number(rec.quantity) || 0)
  }, 0)
}

export function toMainBarQtyFromMovements(
  fnbRawId: string,
  ymd: string,
  movements: FnbMovement[],
): number {
  return movements.reduce((sum, rec) => {
    if (rec.fnbRawId !== fnbRawId) return sum
    if (rec.kind !== 'to_main_bar') return sum
    if (isoToLocalYmd(rec.at) !== ymd) return sum
    return sum + (Number(rec.quantity) || 0)
  }, 0)
}

export function previousClosingForItem(
  itemId: string,
  ymd: string,
  sheets: FnbDailySheet[],
): number | null {
  const prev = sheets.find((s) => s.date === previousCalendarYmd(ymd))
  const line = prev?.lines.find((l) => l.itemId === itemId)
  if (!line) return null
  return fnbSheetClosing(line)
}

export function seedFnbDailyLines(
  items: FnbRawStockItem[],
  ymd: string,
  sheets: FnbDailySheet[],
  issueOutLog: IssueOutRecord[],
  movements: FnbMovement[],
  existing?: FnbDailySheetLine[],
): FnbDailySheetLine[] {
  const byId = new Map((existing ?? []).map((l) => [l.itemId, l]))
  return items.map((item) => {
    const fromSheet = sheets.find((s) => s.date === ymd)?.lines.find((l) => l.itemId === item.id)
    const saved = byId.get(item.id) ?? fromSheet
    const newQty = newQtyFromIssueLog(item.storeItemId, ymd, issueOutLog)
    const toMainBar = toMainBarQtyFromMovements(item.id, ymd, movements)
    const prevClose = previousClosingForItem(item.id, ymd, sheets)
    const opening =
      saved?.opening ??
      (prevClose != null
        ? prevClose
        : Math.max(0, (item.quantityOnHand || 0) + toMainBar - newQty))
    return {
      itemId: item.id,
      opening,
      newQty,
      complimentary: saved?.complimentary ?? 0,
      complimentaryNote: saved?.complimentaryNote,
      soldQty: saved?.soldQty ?? 0,
      unitPrice: saved?.unitPrice ?? item.sellingPricePerPortion ?? 0,
      damage: saved?.damage ?? 0,
      remark: saved?.remark,
      toMainBar,
      appliedComplimentary: fromSheet?.appliedComplimentary,
      appliedSold: fromSheet?.appliedSold,
      appliedDamage: fromSheet?.appliedDamage,
    }
  })
}

export function categoryNameById(
  categories: FnbDrinkCategory[],
  id?: string | null,
): string {
  if (!id) return ''
  return categories.find((c) => c.id === id)?.name ?? ''
}
