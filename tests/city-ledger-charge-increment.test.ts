import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyCityLedgerChargeIncrement,
  cityLedgerChargeShouldUseGuestNameLookup,
  nextCityLedgerBalanceAfterCharge,
} from '../lib/utils/guest-city-ledger.ts'

describe('cityLedgerChargeShouldUseGuestNameLookup', () => {
  it('uses guest name when Add Charge auto-selects guests.id as the ledger id', () => {
    assert.equal(
      cityLedgerChargeShouldUseGuestNameLookup({
        ledgerType: 'individual',
        selectedLedgerId: 'guest-uuid',
        guestId: 'guest-uuid',
      }),
      true,
    )
  })

  it('uses guest name when ledger type is omitted (default individual)', () => {
    assert.equal(
      cityLedgerChargeShouldUseGuestNameLookup({
        selectedLedgerId: 'guest-uuid',
        guestId: 'guest-uuid',
      }),
      true,
    )
  })

  it('uses guest name when no ledger account is selected', () => {
    assert.equal(
      cityLedgerChargeShouldUseGuestNameLookup({
        ledgerType: 'organization',
        selectedLedgerId: null,
        guestId: 'guest-uuid',
      }),
      true,
    )
  })

  it('uses the selected city_ledger_accounts id for an organization', () => {
    assert.equal(
      cityLedgerChargeShouldUseGuestNameLookup({
        ledgerType: 'organization',
        selectedLedgerId: 'ledger-uuid',
        guestId: 'guest-uuid',
      }),
      false,
    )
  })
})

describe('nextCityLedgerBalanceAfterCharge', () => {
  it('adds the charge onto existing AR', () => {
    assert.equal(nextCityLedgerBalanceAfterCharge(40_000, 15_000), 55_000)
  })

  it('creates AR from a zero ledger', () => {
    assert.equal(nextCityLedgerBalanceAfterCharge(0, 15_000), 15_000)
  })
})

type LedgerRow = {
  id: string
  organization_id: string
  account_name: string
  account_type: string
  balance: number
}

function createLedgerClient(rows: LedgerRow[]) {
  const ops: Array<{ type: 'insert' | 'update'; payload: unknown; ids?: string[] }> = []

  const matchesName = (row: LedgerRow, pattern: string) => {
    const want = pattern.replace(/%/g, '').trim().toLowerCase()
    return row.account_name.trim().toLowerCase() === want
  }

  return {
    ops,
    rows,
    from(_table: string) {
      const state: {
        filters: Record<string, unknown>
        ilike?: { column: string; pattern: string }
        inIds?: string[]
        updatePayload?: Record<string, unknown>
      } = { filters: {} }

      const builder: Record<string, unknown> = {}
      const asThen = () => ({
        then(
          resolve: (value: { data: LedgerRow[] | null; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          let data = rows.filter((row) => {
            if (state.filters.organization_id && row.organization_id !== state.filters.organization_id) {
              return false
            }
            if (state.ilike && !matchesName(row, state.ilike.pattern)) return false
            if (Array.isArray(state.filters.account_type)) {
              if (!state.filters.account_type.includes(row.account_type)) return false
            }
            return true
          })
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      })

      Object.assign(builder, {
        select() {
          return builder
        },
        eq(column: string, value: unknown) {
          state.filters[column] = value
          if (state.updatePayload && column === 'id') {
            const id = String(value)
            for (const row of rows) {
              if (row.id === id) Object.assign(row, state.updatePayload)
            }
            ops.push({ type: 'update', payload: state.updatePayload, ids: [id] })
            return Promise.resolve({ error: null })
          }
          return builder
        },
        ilike(column: string, pattern: string) {
          state.ilike = { column, pattern }
          return builder
        },
        in(column: string, values: string[]) {
          if (column === 'account_type') {
            state.filters.account_type = values
            return builder
          }
          if (state.updatePayload) {
            for (const row of rows) {
              if (values.includes(row.id)) Object.assign(row, state.updatePayload)
            }
            ops.push({ type: 'update', payload: state.updatePayload, ids: values })
            return Promise.resolve({ error: null })
          }
          state.inIds = values
          return builder
        },
        limit() {
          return builder
        },
        maybeSingle() {
          const id = String(state.filters.id || '')
          const row = rows.find((r) => r.id === id) ?? null
          return Promise.resolve({ data: row, error: null })
        },
        update(payload: Record<string, unknown>) {
          state.updatePayload = payload
          return builder
        },
        insert(incoming: LedgerRow[]) {
          ops.push({ type: 'insert', payload: incoming })
          for (const row of incoming) {
            rows.push({
              id: row.id || `created-${rows.length + 1}`,
              organization_id: row.organization_id,
              account_name: row.account_name,
              account_type: row.account_type,
              balance: row.balance,
            })
          }
          return Promise.resolve({ error: null })
        },
        ...asThen(),
      })
      return builder
    },
  }
}

describe('applyCityLedgerChargeIncrement', () => {
  it('increments the guest ledger by name when selected id is guests.id', async () => {
    const client = createLedgerClient([
      {
        id: 'ledger-1',
        organization_id: 'org-1',
        account_name: 'Ada Guest',
        account_type: 'individual',
        balance: 10_000,
      },
    ])

    await applyCityLedgerChargeIncrement(client as never, {
      organizationId: 'org-1',
      amount: 15_000,
      guestName: 'Ada Guest',
      guestId: 'guest-uuid',
      ledgerType: 'individual',
      selectedLedgerId: 'guest-uuid',
    })

    assert.equal(client.rows[0].balance, 25_000)
    assert.equal(
      client.ops.some((op) => op.type === 'update' && (op.ids || []).includes('ledger-1')),
      true,
    )
    assert.equal(
      client.ops.some((op) => (op.ids || []).includes('guest-uuid')),
      false,
    )
  })

  it('creates a guest ledger row when none exists', async () => {
    const client = createLedgerClient([])

    await applyCityLedgerChargeIncrement(client as never, {
      organizationId: 'org-1',
      amount: 15_000,
      guestName: 'Ada Guest',
      guestId: 'guest-uuid',
      ledgerType: 'individual',
      selectedLedgerId: 'guest-uuid',
    })

    assert.equal(client.ops[0]?.type, 'insert')
    assert.equal(client.rows[0]?.account_name, 'Ada Guest')
    assert.equal(client.rows[0]?.balance, 15_000)
    assert.equal(client.rows[0]?.account_type, 'individual')
  })

  it('updates the selected organization ledger account by id', async () => {
    const client = createLedgerClient([
      {
        id: 'corp-ledger',
        organization_id: 'org-1',
        account_name: 'Acme Ltd',
        account_type: 'organization',
        balance: 5_000,
      },
    ])

    await applyCityLedgerChargeIncrement(client as never, {
      organizationId: 'org-1',
      amount: 8_000,
      guestName: 'Ada Guest',
      guestId: 'guest-uuid',
      ledgerType: 'organization',
      selectedLedgerId: 'corp-ledger',
    })

    assert.equal(client.rows[0].balance, 13_000)
  })

  it('does not invent an organization row when the selected id is missing', async () => {
    const client = createLedgerClient([])

    await applyCityLedgerChargeIncrement(client as never, {
      organizationId: 'org-1',
      amount: 8_000,
      guestName: 'Ada Guest',
      guestId: 'guest-uuid',
      ledgerType: 'organization',
      selectedLedgerId: 'missing-ledger',
    })

    assert.equal(client.rows.length, 0)
    assert.equal(client.ops.length, 0)
  })
})
