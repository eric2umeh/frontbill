import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyCityLedgerReversals,
  ledgerBalanceAfterReversal,
  parseCityLedgerAccountNameFromNotes,
  planCityLedgerReversalsForDeletedBooking,
} from '../lib/booking/reverse-city-ledger-on-booking-delete.ts'

type Row = Record<string, unknown>

/** Minimal PostgREST-shaped fake for the reversal writes. */
function fakeAdmin(seed: { accounts: Row[]; orgs: Row[] }) {
  const accounts = seed.accounts.map((row) => ({ ...row }))
  const orgs = seed.orgs.map((row) => ({ ...row }))

  function query(table: 'city_ledger_accounts' | 'organizations') {
    const rows = table === 'city_ledger_accounts' ? accounts : orgs
    const filters: Array<[string, unknown]> = []
    let patch: Row | null = null
    const matched = () =>
      rows.filter((row) =>
        filters.every(([col, val]) => {
          if (typeof val === 'string' && typeof row[col] === 'string') {
            return String(row[col]).toLowerCase() === val.toLowerCase()
          }
          return row[col] === val
        }),
      )
    const api = {
      select() {
        return api
      },
      eq(col: string, val: unknown) {
        filters.push([col, val])
        return api
      },
      ilike(col: string, val: unknown) {
        filters.push([col, val])
        return api
      },
      update(next: Row) {
        patch = next
        return api
      },
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        const hits = matched()
        if (patch) {
          for (const row of hits) Object.assign(row, patch)
        }
        resolve({ data: hits, error: null })
      },
    }
    return api
  }

  return {
    accounts,
    orgs,
    client: {
      from(table: string) {
        return query(table as 'city_ledger_accounts' | 'organizations')
      },
    } as unknown as SupabaseClient,
  }
}

describe('planCityLedgerReversalsForDeletedBooking', () => {
  it('reverses an unpaid city-ledger room charge and an extension on the same account', () => {
    const plan = planCityLedgerReversalsForDeletedBooking(
      [
        {
          amount: 50000,
          charge_type: 'room_charge',
          payment_method: 'city_ledger',
          payment_status: 'city_ledger',
          ledger_account_id: 'acct-acme',
          ledger_account_type: 'organization',
          description: 'Initial booking charge - 2 nights',
        },
        {
          amount: 20000,
          charge_type: 'extended_stay',
          payment_method: 'city_ledger',
          payment_status: 'pending',
          ledger_account_id: 'acct-acme',
          ledger_account_type: 'organization',
          description: 'Extended Stay - 1 night',
        },
      ],
      'City Ledger: Acme Ltd',
    )

    assert.deepEqual(plan.byAccountId, [
      { accountId: 'acct-acme', amount: 70000, orgMirrorAmount: 70000 },
    ])
    assert.deepEqual(plan.byAccountName, [])
  })

  it('uses the check-in note when the folio line has no ledger account id', () => {
    const plan = planCityLedgerReversalsForDeletedBooking(
      [
        {
          amount: 40000,
          charge_type: 'room_charge',
          payment_method: 'city_ledger',
          payment_status: 'unpaid',
          description: 'Check-in charge — 2 nights',
        },
      ],
      'City Ledger: Acme Ltd | driver: 4412',
    )

    assert.deepEqual(plan.byAccountId, [])
    assert.deepEqual(plan.byAccountName, [{ accountName: 'Acme Ltd', amount: 40000 }])
  })

  it('leaves cash stays, paid lines, and outlet sales alone', () => {
    const plan = planCityLedgerReversalsForDeletedBooking(
      [
        {
          amount: 30000,
          charge_type: 'room_charge',
          payment_method: 'pos',
          payment_status: 'paid',
          description: 'Initial booking charge - 1 night',
        },
        {
          amount: 8000,
          charge_type: 'additional_charge',
          payment_method: 'city_ledger',
          payment_status: 'pending',
          ledger_account_id: 'acct-acme',
          description: 'Restaurant — Jollof ×1 (RS-100)',
        },
        {
          amount: 15000,
          charge_type: 'room_charge',
          payment_method: 'city_ledger',
          payment_status: 'paid',
          ledger_account_id: 'acct-acme',
          ledger_account_type: 'organization',
          description: 'Initial booking charge - 1 night',
        },
      ],
      'payment_method: pos',
    )

    assert.deepEqual(plan.byAccountId, [])
    assert.deepEqual(plan.byAccountName, [])
  })

  it('does not invent a reversal from the placeholder account name', () => {
    const plan = planCityLedgerReversalsForDeletedBooking(
      [
        {
          amount: 10000,
          charge_type: 'room_charge',
          payment_method: 'city_ledger',
          payment_status: 'unpaid',
          description: 'Check-in charge — 1 night',
        },
      ],
      'City Ledger: account',
    )
    assert.deepEqual(plan.byAccountName, [])
  })
})

describe('parseCityLedgerAccountNameFromNotes', () => {
  it('reads the company name and ignores later stay notes', () => {
    assert.equal(
      parseCityLedgerAccountNameFromNotes(
        'City Ledger: Globex\nStay rescheduled 2026-11-01–2026-11-03 → 2026-11-02–2026-11-04',
      ),
      'Globex',
    )
    assert.equal(parseCityLedgerAccountNameFromNotes('payment_method: cash'), null)
  })
})

describe('applyCityLedgerReversals', () => {
  it('subtracts the stay from the company balance and keeps credit when already paid down', async () => {
    const db = fakeAdmin({
      accounts: [
        {
          id: 'acct-acme',
          organization_id: 'hotel-1',
          account_name: 'Acme Ltd',
          account_type: 'organization',
          balance: 0,
        },
      ],
      orgs: [{ id: 'acct-acme', current_balance: 0 }],
    })

    await applyCityLedgerReversals(db.client, 'hotel-1', {
      byAccountId: [{ accountId: 'acct-acme', amount: 50000, orgMirrorAmount: 50000 }],
      byAccountName: [],
    })

    assert.equal(db.accounts[0].balance, -50000)
    assert.equal(db.orgs[0].current_balance, -50000)
  })

  it('does not reverse a check-in note that matches two accounts', async () => {
    const db = fakeAdmin({
      accounts: [
        {
          id: 'a',
          organization_id: 'hotel-1',
          account_name: 'Acme Ltd',
          account_type: 'organization',
          balance: 40000,
        },
        {
          id: 'b',
          organization_id: 'hotel-1',
          account_name: 'Acme Ltd',
          account_type: 'organization',
          balance: 40000,
        },
      ],
      orgs: [],
    })

    await applyCityLedgerReversals(db.client, 'hotel-1', {
      byAccountId: [],
      byAccountName: [{ accountName: 'Acme Ltd', amount: 40000 }],
    })

    assert.equal(db.accounts[0].balance, 40000)
    assert.equal(db.accounts[1].balance, 40000)
  })
})

describe('ledgerBalanceAfterReversal', () => {
  it('keeps a negative result when the company had already paid', () => {
    assert.equal(ledgerBalanceAfterReversal(0, 20000), -20000)
    assert.equal(ledgerBalanceAfterReversal(-8000, 2000), -10000)
    assert.equal(ledgerBalanceAfterReversal(50000, 20000), 30000)
  })
})
