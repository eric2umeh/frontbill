import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveProfileOrganizationScope } from '../lib/supply-chain/supply-api-auth'
import {
  canSyncSupplyCatalog,
  hasForeignCatalogOwnership,
} from '../lib/supply-chain/supply-catalog-sync-security'

describe('supply API tenant and catalog sync security', () => {
  it('does not derive an unlinked profile organization from client input', () => {
    assert.equal(resolveProfileOrganizationScope(null, 'client-org'), null)
    assert.equal(resolveProfileOrganizationScope(undefined, 'client-org'), null)
  })

  it('rejects a client organization that differs from the authenticated profile organization', () => {
    assert.equal(resolveProfileOrganizationScope('profile-org', 'other-org'), null)
    assert.equal(resolveProfileOrganizationScope('profile-org', 'profile-org'), 'profile-org')
  })

  it('limits full catalog sync to roles that can manage store catalog items', () => {
    assert.equal(canSyncSupplyCatalog('admin'), true)
    assert.equal(canSyncSupplyCatalog('superadmin'), true)
    assert.equal(canSyncSupplyCatalog('chef'), false)
    assert.equal(canSyncSupplyCatalog('store'), false)
  })

  it('detects catalog rows owned by a different organization before upsert', () => {
    assert.equal(
      hasForeignCatalogOwnership([{ organization_id: 'hotel-a' }], 'hotel-a'),
      false,
    )
    assert.equal(
      hasForeignCatalogOwnership([{ organization_id: 'hotel-b' }], 'hotel-a'),
      true,
    )
  })
})
