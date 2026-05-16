import { slugifyExpenseCode } from './default-categories'

export type ParsedExpenseCell = {
  expense_date: string
  category_name: string
  category_code: string
  amount: number
}

export type ParsedExpenseDayNote = {
  expense_date: string
  description: string
}

export type ParsedExpenditureImport = {
  categories: { code: string; name: string; sort_order: number }[]
  cells: ParsedExpenseCell[]
  dayNotes: ParsedExpenseDayNote[]
}

function excelSerialToYmd(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const utc = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)))
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateCell(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const n = Number(s)
  if (Number.isFinite(n) && n > 40000 && n < 60000) {
    return excelSerialToYmd(n)
  }
  const dmY = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (dmY) {
    const dd = dmY[1].padStart(2, '0')
    const mm = dmY[2].padStart(2, '0')
    let yy = parseInt(dmY[3], 10)
    if (yy < 100) yy += 2000
    return `${yy}-${mm}-${dd}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

function parseAmount(raw: string): number | null {
  const s = String(raw || '').trim().replace(/,/g, '')
  if (!s || s === '0') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Parse a 2D grid (first row = headers) from Excel/CSV export. */
export function parseExpenditureGrid(rows: string[][]): ParsedExpenditureImport {
  const categories: { code: string; name: string; sort_order: number }[] = []
  const cells: ParsedExpenseCell[] = []
  const dayNotes: ParsedExpenseDayNote[] = []

  if (!rows.length) return { categories, cells, dayNotes }

  let headerRowIdx = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] || []
    const joined = row.join(' ').toUpperCase()
    if (joined.includes('DATE') && (joined.includes('DISCRIPTION') || joined.includes('DESCRIPTION'))) {
      headerRowIdx = i
      break
    }
  }
  if (headerRowIdx < 0) headerRowIdx = 0

  const headers = (rows[headerRowIdx] || []).map((h) => String(h || '').trim())
  const dateCol = 0
  const descCol = headers.findIndex((h) => /^desc/i.test(h) || /discription/i.test(h))
  const categoryCols: { idx: number; name: string; code: string }[] = []

  for (let c = 0; c < headers.length; c++) {
    if (c === dateCol || c === descCol) continue
    const name = headers[c]
    if (!name) continue
    const upper = name.toUpperCase()
    if (upper === 'TOTAL' || upper.startsWith('TOTAL ')) continue
    const code = slugifyExpenseCode(name)
    categoryCols.push({ idx: c, name, code })
    categories.push({ code, name, sort_order: (c + 1) * 10 })
  }

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || []
    const dateRaw = row[dateCol]
    const dateStr = parseDateCell(String(dateRaw ?? ''))
    if (!dateStr) continue

    const desc =
      descCol >= 0 ? String(row[descCol] || '').trim() : ''
    if (desc) dayNotes.push({ expense_date: dateStr, description: desc })

    for (const col of categoryCols) {
      const amt = parseAmount(String(row[col.idx] ?? ''))
      if (amt == null) continue
      cells.push({
        expense_date: dateStr,
        category_name: col.name,
        category_code: col.code,
        amount: amt,
      })
    }
  }

  return { categories, cells, dayNotes }
}
