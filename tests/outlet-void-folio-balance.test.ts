import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bookingBalanceAfterReversingPendingOutletCharge,
  outletSettlementReversesBookingBalance,
  updateOutletFolioOnSettlement,
} from '../lib/outlets/booking-folio'
import {
  bookingBalanceAfterVoidingOutletFolioLine,
  reverseOutletOrderSettlement,
} from '../lib/outlets/reverse-outlet-order-settlement'

/**
 * Room balance includes a restaurant bill only while that folio line is still
 * unpaid. Cash settlement clears it. Void must not add the meal back, or
 * checkout collects a charge that was deleted.
 */

type Row = Record<string, unknown>

function createAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      let op: 'select' | 'update' | 'delete' = 'select'
      let patch: Row | null = null

      const run = () => {
        const rows = tables[table] ?? []
        const hit = (row: Row) => filters.every(([key, value]) => row[key] === value)
        if (op === 'delete') {
          tables[table] = rows.filter((row) => !hit(row))
          return { data: null, error: null }
        }
        if (op === 'update' && patch) {
          for (const row of rows) {
            if (hit(row)) Object.assign(row, patch)
          }
          return { data: null, error: null }
        }
        const found = rows.filter(hit)
        return { data: found[0] ? { ...found[0] } : null, error: null }
      }

      const builder: PromiseLike<{ data: unknown; error: null }> & {
        select: () => typeof builder
        eq: (column: string, value: unknown) => typeof builder
        update: (next: Row) => typeof builder
        delete: () => typeof builder
        maybeSingle: () => Promise<{ data: unknown; error: null }>
      } = {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          filters.push([column, value])
          return builder
        },
        update(next: Row) {
          op = 'update'
          patch = next
          return builder
        },
        delete() {
          op = 'delete'
          return builder
        },
        maybeSingle() {
          return Promise.resolve(run())
        },
        then(resolve, reject) {
          try {
            resolve(run())
          } catch (error) {
            reject?.(error)
          }
        },
      }
      return builder
    },
  }
}

describe('outlet folio balance on settle and void', () => {
  it('does not reverse a paid-on-spot folio insert', () => {
    assert.equal(outletSettlementReversesBookingBalance('paid'), false)
    assert.equal(outletSettlementReversesBookingBalance(null), false)
    assert.equal(outletSettlementReversesBookingBalance('city_ledger'), false)
  })

  it('reverses a pending open-bill folio line when it is paid', () => {
    assert.equal(outletSettlementReversesBookingBalance('pending'), true)
    assert.equal(outletSettlementReversesBookingBalance('Unpaid'), true)
    assert.equal(bookingBalanceAfterReversingPendingOutletCharge(43_500, 3_500), 40_000)
    assert.equal(bookingBalanceAfterReversingPendingOutletCharge(1_000, 3_500), 0)
  })

  it('leaves the room balance unchanged when a paid outlet line is voided', () => {
    assert.equal(
      bookingBalanceAfterVoidingOutletFolioLine(40_000, 3_500, 'paid', 'cash'),
      40_000,
    )
    assert.equal(
      bookingBalanceAfterVoidingOutletFolioLine(40_000, 3_500, 'paid', 'pos'),
      40_000,
    )
    assert.equal(
      bookingBalanceAfterVoidingOutletFolioLine(40_000, 3_500, 'paid', 'transfer'),
      40_000,
    )
  })

  it('removes a still-owed outlet line from the room balance on void', () => {
    assert.equal(
      bookingBalanceAfterVoidingOutletFolioLine(43_500, 3_500, 'pending', 'city_ledger'),
      40_000,
    )
    assert.equal(
      bookingBalanceAfterVoidingOutletFolioLine(43_500, 3_500, 'pending', 'cash'),
      40_000,
    )
    assert.equal(
      bookingBalanceAfterVoidingOutletFolioLine(1_000, 3_500, 'unpaid', null),
      0,
    )
  })

  it('does not reduce the room bill when settling an already-paid outlet line', async () => {
    const tables = {
      folio_charges: [
        {
          id: 'fc-1',
          amount: 3500,
          payment_status: 'paid',
          payment_method: 'cash',
        },
      ],
      bookings: [{ id: 'bk-1', balance: 40_000 }],
    }
    await updateOutletFolioOnSettlement(createAdmin(tables) as never, {
      folioChargeId: 'fc-1',
      bookingId: 'bk-1',
      paymentMethod: 'cash',
      amount: 3500,
      complimentary: false,
    })
    assert.equal(tables.bookings[0].balance, 40_000)
    assert.equal(tables.folio_charges[0].payment_status, 'paid')
  })

  it('returns the room bill to the pre-meal balance when a pending open bill is paid', async () => {
    const tables = {
      folio_charges: [
        {
          id: 'fc-1',
          amount: 3500,
          payment_status: 'pending',
          payment_method: null,
        },
      ],
      bookings: [{ id: 'bk-1', balance: 43_500 }],
    }
    await updateOutletFolioOnSettlement(createAdmin(tables) as never, {
      folioChargeId: 'fc-1',
      bookingId: 'bk-1',
      paymentMethod: 'cash',
      amount: 3500,
      complimentary: false,
    })
    assert.equal(tables.bookings[0].balance, 40_000)
    assert.equal(tables.folio_charges[0].payment_status, 'paid')
  })

  it('voiding a cash-settled room outlet order does not recreate the meal debt', async () => {
    const tables: Record<string, Row[]> = {
      folio_charges: [
        { id: 'fc-1', amount: 3500, payment_status: 'paid' },
      ],
      bookings: [{ id: 'bk-1', balance: 40_000 }],
      transactions: [],
      payments: [{ id: 'pay-1', amount: 3500 }],
      outlet_orders: [{ id: 'ord-1', payment_id: 'pay-1' }],
    }
    await reverseOutletOrderSettlement(createAdmin(tables) as never, {
      organizationId: 'org-1',
      voidReason: 'Wrong order',
      order: {
        id: 'ord-1',
        order_number: 'RST-100',
        department: 'restaurant',
        subtotal: 3500,
        payment_method: 'cash',
        booking_id: 'bk-1',
        folio_charge_id: 'fc-1',
        payment_id: 'pay-1',
        is_complimentary: false,
        outlet_order_lines: [{ item_name: 'Jollof', qty: 1 }],
      },
    })
    assert.equal(tables.bookings[0].balance, 40_000)
    assert.equal(tables.folio_charges.length, 0)
    assert.equal(tables.payments.length, 0)
  })

  it('voiding a city-ledger outlet charge removes it from the room balance', async () => {
    const tables: Record<string, Row[]> = {
      folio_charges: [
        { id: 'fc-1', amount: 3500, payment_status: 'pending' },
      ],
      bookings: [{ id: 'bk-1', balance: 43_500 }],
      transactions: [],
      payments: [],
      outlet_orders: [{ id: 'ord-1', payment_id: null }],
    }
    await reverseOutletOrderSettlement(createAdmin(tables) as never, {
      organizationId: 'org-1',
      voidReason: 'Guest cancelled',
      order: {
        id: 'ord-1',
        order_number: 'RST-101',
        department: 'restaurant',
        subtotal: 3500,
        payment_method: 'city_ledger',
        booking_id: 'bk-1',
        folio_charge_id: 'fc-1',
        payment_id: null,
        is_complimentary: false,
        outlet_order_lines: [{ item_name: 'Jollof', qty: 1 }],
      },
    })
    assert.equal(tables.bookings[0].balance, 40_000)
    assert.equal(tables.folio_charges.length, 0)
  })
})
