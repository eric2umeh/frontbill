import assert from 'node:assert/strict'
import test from 'node:test'

import { authorizeCatalogSync } from '../app/api/supply/catalog/sync/route'
import type { SupplyAuthed } from '../lib/supply-chain/supply-api-auth'

function authForRole(role: string): SupplyAuthed {
  return {
    userId: 'user-1',
    orgId: 'org-1',
    role,
  }
}

test('catalog sync rejects authenticated roles without central-store access', async () => {
  const denied = authorizeCatalogSync(authForRole('cashier'))

  assert.ok(denied, 'expected cashier catalog sync to be denied')
  assert.equal(denied.status, 403)
  assert.deepEqual(await denied.json(), { error: 'Forbidden' })
})

test('catalog sync allows roles with central-store access', () => {
  assert.equal(authorizeCatalogSync(authForRole('store')), null)
  assert.equal(authorizeCatalogSync(authForRole('accountant')), null)
  assert.equal(authorizeCatalogSync(authForRole('food_beverage')), null)
})
