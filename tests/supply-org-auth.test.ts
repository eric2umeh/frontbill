import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAuthorizedSupplyOrgId } from '../lib/supply-chain/supply-org-auth'

test('supply org authorization uses the profile organization', () => {
  assert.equal(resolveAuthorizedSupplyOrgId('org-1', null), 'org-1')
  assert.equal(resolveAuthorizedSupplyOrgId(' org-1 ', 'org-1'), 'org-1')
})

test('supply org authorization rejects client-selected tenants', () => {
  assert.equal(resolveAuthorizedSupplyOrgId(null, 'org-2'), null)
  assert.equal(resolveAuthorizedSupplyOrgId('', 'org-2'), null)
  assert.equal(resolveAuthorizedSupplyOrgId('org-1', 'org-2'), null)
})
