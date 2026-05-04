'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, CalendarIcon, Printer, ChevronDown, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const WAT_OFFSET = '+01:00'

/** Lagos (WAT) calendar bounds for filtering charge created_at timestamps */
function lagosDayBoundsISO(day: Date) {
  const ymd = format(day, 'yyyy-MM-dd')
  return {
    start: `${ymd}T00:00:00.000${WAT_OFFSET}`,
    end: `${ymd}T23:59:59.999${WAT_OFFSET}`,
  }
}

/** Default VAT extraction: treat folio gross as VAT-inclusive @ 7.5% */
const DEFAULT_VAT_INCLUSIVE_DIVISOR = 1 + 0.075

function splitInclusiveVat(gross: number): { preTax: number; vat: number } {
  if (gross <= 0) return { preTax: 0, vat: 0 }
  const preTax = gross / DEFAULT_VAT_INCLUSIVE_DIVISOR
  const vat = gross - preTax
  return { preTax, vat }
}

function formatMoneyExact(n: number) {
  return n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function classifyRoomCharge(chargeType: string, description: string): boolean {
  const t = (chargeType || '').toLowerCase()
  if (['room_charge', 'extended_stay', 'reservation'].includes(t)) return true
  const d = (description || '').toLowerCase()
  if (t === 'charge' && (/\broom\b/i.test(description || '') || d.includes('nightly'))) return true
  return false
}

interface GuestDailyRevenueSummaryProps {
  organizationId: string
  printedByName: string | null
}

interface GuestMini {
  id: string
  name: string
}

export function GuestDailyRevenueSummary({
  organizationId,
  printedByName,
}: GuestDailyRevenueSummaryProps) {
  const [date, setDate] = useState<Date>(new Date())
  const [guestOpen, setGuestOpen] = useState(false)
  const [guestSearch, setGuestSearch] = useState('')
  const [guestOptions, setGuestOptions] = useState<GuestMini[]>([])
  const [guestId, setGuestId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState('Hotel')

  const [loadingGuests, setLoadingGuests] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)

  const [roomGross, setRoomGross] = useState(0)
  const [addedChargesGross, setAddedChargesGross] = useState(0)
  const [folioIds, setFolioIds] = useState<string[]>([])

  const dateStrNg = format(date, 'M/d/yyyy')
  const nowPrinted = format(new Date(), 'M/d/yyyy h:mm:ss a')

  const loadHotelName = useCallback(async () => {
    try {
      const supabase = createClient()
      if (!supabase) return
      const { data } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .maybeSingle()
      if (data?.name) setHotelName(data.name)
    } catch {
      /* keep default */
    }
  }, [organizationId])

  useEffect(() => {
    loadHotelName()
  }, [loadHotelName])

  const loadGuests = useCallback(async () => {
    try {
      setLoadingGuests(true)
      const supabase = createClient()
      if (!supabase) {
        setGuestOptions([])
        return
      }
      const term = `%${guestSearch.trim()}%`
      const q = supabase
        .from('guests')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name')
        .limit(200)
      const { data, error } = guestSearch.trim()
        ? await q.ilike('name', term)
        : await q
      if (error) throw error
      setGuestOptions((data || []) as GuestMini[])
    } catch {
      toast.error('Failed to load guests')
      setGuestOptions([])
    } finally {
      setLoadingGuests(false)
    }
  }, [organizationId, guestSearch])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadGuests()
    }, guestOpen ? (guestSearch ? 200 : 0) : 400)
    return () => window.clearTimeout(id)
  }, [guestOpen, guestSearch, loadGuests])

  const selectedGuestLabel = guestOptions.find((g) => g.id === guestId)?.name ?? null

  const runReport = useCallback(async () => {
    if (!guestId) {
      toast.message('Pick a guest first')
      return
    }
    const supabase = createClient()
    if (!supabase) {
      toast.error('Database not configured')
      return
    }

    try {
      setLoadingReport(true)
      const dateKey = format(date, 'yyyy-MM-dd')
      const { start, end } = lagosDayBoundsISO(date)

      const { data: dayBookings, error: be } = await supabase
        .from('bookings')
        .select('id, folio_id, rate_per_night')
        .eq('organization_id', organizationId)
        .eq('guest_id', guestId)
        .lte('check_in', dateKey)
        .gte('check_out', dateKey)
        .not('status', 'eq', 'cancelled')

      if (be) throw be
      const bookingIds = [...new Set((dayBookings || []).map((b: any) => b.id))]
      const folios = [...new Set((dayBookings || []).map((b: any) => b.folio_id).filter(Boolean))] as string[]

      if (bookingIds.length === 0) {
        setRoomGross(0)
        setAddedChargesGross(0)
        setFolioIds([])
        toast.message('No in-house booking for this guest on the selected date')
        setLoadingReport(false)
        return
      }

      const { data: charges, error: ce } = await supabase
        .from('folio_charges')
        .select('amount, charge_type, description, created_at')
        .in('booking_id', bookingIds)
        .gte('created_at', start)
        .lte('created_at', end)

      if (ce) throw ce

      let room = 0
      let added = 0
      for (const c of charges || []) {
        const amt = Number((c as any).amount ?? 0)
        const ctype = String((c as any).charge_type || '')
        if (ctype === 'payment') continue
        if (amt <= 0) continue

        const desc = String((c as any).description || '')
        if (classifyRoomCharge(ctype, desc)) room += amt
        else added += amt // additional_charge, charge, deferred, etc. → Added Charges blob
      }

      if (room <= 0 && bookingIds.length > 0) {
        let rack = 0
        for (const b of dayBookings || []) {
          rack += Number((b as any).rate_per_night || 0)
        }
        if (rack > 0) room = rack
      }

      setRoomGross(room)
      setAddedChargesGross(added)
      setFolioIds(folios.map(String))
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to build summary')
      setRoomGross(0)
      setAddedChargesGross(0)
      setFolioIds([])
    } finally {
      setLoadingReport(false)
    }
  }, [date, guestId, organizationId])

  const segments = useMemo(() => {
    const frontDesk = splitInclusiveVat(roomGross)
    const posCombined = splitInclusiveVat(addedChargesGross)
    const misc = { preTax: 0, vat: 0, gross: 0 }

    const rows = [
      {
        section: 'Front Desk',
        label: 'Room Revenue',
        preTax: frontDesk.preTax,
        vat: frontDesk.vat,
        sc: 0,
        tax3: 0,
        tax4: 0,
        adjustment: 0,
        gross: roomGross,
      },
      {
        section: 'Misc Income',
        label: 'Misc. Sales',
        preTax: misc.preTax,
        vat: misc.vat,
        sc: 0,
        tax3: 0,
        tax4: 0,
        adjustment: 0,
        gross: misc.gross,
      },
      {
        section: 'POS Revenue',
        label: 'Added Charges',
        preTax: posCombined.preTax,
        vat: posCombined.vat,
        sc: 0,
        tax3: 0,
        tax4: 0,
        adjustment: 0,
        gross: addedChargesGross,
      },
    ]

    const totalPre = rows.reduce((s, r) => s + r.preTax, 0)
    const totalVat = rows.reduce((s, r) => s + r.vat, 0)
    const totalGross = rows.reduce((s, r) => s + r.gross, 0)
    const totalTax = totalVat // SC / Tax3 / Tax4 placeholders → fold into VAT column for Ground Total clarity

    return { rows, totalPre, totalVat: totalTax, totalGross }
  }, [roomGross, addedChargesGross])

  return (
    <div className="space-y-4 print-section guest-revenue-summary-print">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Popover open={guestOpen} onOpenChange={setGuestOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn('min-w-[240px] justify-between font-normal')}>
              <span className="flex items-center gap-2 truncate">
                <User className="h-4 w-4 shrink-0" />
                {selectedGuestLabel || 'Select guest'}
              </span>
              <ChevronDown className="h-4 w-4 opacity-60 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(380px,var(--radix-popover-content-available-width,380px))] p-2" align="start">
            <Input
              placeholder="Search guest name..."
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-56 overflow-y-auto border rounded-md">
              {loadingGuests ? (
                <div className="flex justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : guestOptions.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No guests match</div>
              ) : (
                guestOptions.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm"
                    onClick={() => {
                      setGuestId(g.id)
                      setGuestOpen(false)
                    }}
                  >
                    {g.name}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, 'dd MMM yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
          </PopoverContent>
        </Popover>

        <Button onClick={() => runReport()} disabled={loadingReport || !guestId}>
          {loadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
        </Button>

        <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!guestId}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="rounded-lg border bg-white dark:bg-background p-4 md:p-6 text-black dark:text-foreground shadow-sm">
        {/* Print header */}
        <div className="text-center border-b pb-4 mb-4">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">{hotelName}</h2>
          <p className="text-sm font-semibold mt-1">Daily Revenue Summary (Guest)</p>
          <p className="text-xs text-muted-foreground mt-2 print:text-gray-700">
            Printed By: {printedByName || '—'} · Printed: {nowPrinted}
          </p>
          <p className="text-xs mt-1">
            <span className="font-medium">Guest:</span> {selectedGuestLabel || '—'}
            {folioIds.length > 0 && (
              <span className="ml-3">
                <span className="font-medium">Folio:</span> {folioIds.join(', ')}
              </span>
            )}
          </p>
          <p className="text-xs mt-1 text-muted-foreground print:text-gray-700">
            Date Range: From {dateStrNg} to {dateStrNg} · Currency: NGN · VAT shown at 7.5% inclusive (default)
          </p>
          <p className="text-[11px] mt-2 text-muted-foreground print:text-gray-700">
            POS-style lines (misc. descriptions) grouped as Added Charges pending dedicated restaurant/laundry codes.
          </p>
        </div>

        {loadingReport ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm border-collapse border border-neutral-800 print:border-neutral-900">
                <thead>
                  <tr className="bg-neutral-100 print:bg-neutral-100">
                    <th className="border border-neutral-400 px-2 py-2 text-left font-semibold">Revenue</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">Pre Tax</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">VAT</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">SC</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">Tax3</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">Tax4</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">TotalTax</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">Adjustment</th>
                    <th className="border border-neutral-400 px-2 py-2 text-right font-semibold">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(['Front Desk', 'Misc Income', 'POS Revenue'] as const).map((section) => {
                    const bucket = segments.rows.filter((r) => r.section === section)
                    return (
                      <FragmentBlock key={section} section={section} rows={bucket} />
                    )
                  })}
                  <tr className="bg-neutral-50 font-semibold">
                    <td className="border border-neutral-400 px-2 py-2">Ground Total</td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">
                      {formatMoneyExact(segments.totalPre)}
                    </td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">
                      {formatMoneyExact(segments.totalVat)}
                    </td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">{formatMoneyExact(0)}</td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">{formatMoneyExact(0)}</td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">{formatMoneyExact(0)}</td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">
                      {formatMoneyExact(segments.totalVat)}
                    </td>
                    <td className="border border-neutral-400 px-2 py-2 text-right">{formatMoneyExact(0)}</td>
                    <td className="border border-neutral-400 px-2 py-2 text-right font-bold">
                      {formatMoneyExact(segments.totalGross)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 border rounded-md overflow-hidden max-w-xl">
              <div className="bg-neutral-100 print:bg-neutral-100 px-3 py-2 text-sm font-semibold border-b">
                Summary
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Front Desk</td>
                    <td className="px-3 py-2 text-right">{formatNaira(roomGross)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Misc Income</td>
                    <td className="px-3 py-2 text-right">{formatNaira(0)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">POS / Added Charges</td>
                    <td className="px-3 py-2 text-right">{formatNaira(addedChargesGross)}</td>
                  </tr>
                  <tr className="bg-neutral-50 font-semibold">
                    <td className="px-3 py-2">Ground Total</td>
                    <td className="px-3 py-2 text-right">{formatNaira(segments.totalGross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FragmentBlock({
  section,
  rows,
}: {
  section: string
  rows: {
    section: string
    label: string
    preTax: number
    vat: number
    gross: number
  }[]
}) {
  let subPre = 0
  let subVat = 0
  let subGross = 0

  const body = rows.map((r) => {
    subPre += r.preTax
    subVat += r.vat
    subGross += r.gross
    const totalTax = r.vat
    return (
      <tr key={`${section}-${r.label}`}>
        <td className="border border-neutral-400 px-2 py-1.5 pl-4">{r.label}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(r.preTax)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(r.vat)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(totalTax)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right font-medium">
          {formatMoneyExact(r.gross)}
        </td>
      </tr>
    )
  })

  return (
    <>
      <tr className="bg-neutral-50/90">
        <td colSpan={9} className="border border-neutral-400 px-2 py-1.5 font-bold">
          {section}
        </td>
      </tr>
      {body}
      <tr className="font-semibold bg-neutral-50/50">
        <td className="border border-neutral-400 px-2 py-1.5 pl-4">Group Total</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(subPre)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(subVat)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(subVat)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(0)}</td>
        <td className="border border-neutral-400 px-2 py-1.5 text-right">{formatMoneyExact(subGross)}</td>
      </tr>
    </>
  )
}
