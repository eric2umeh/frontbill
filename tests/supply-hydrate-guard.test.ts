import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allowSupplyCatalogSync,
  allowSupplySnapshotPersist,
  shouldCatchupUploadAfterHydrate,
  shouldRecoverLocalCatalogToCloud,
  shouldSkipEmptySnapshotOverwrite,
} from '../lib/supply-chain/supply-hydrate-guard'

describe('supply hydrate persist guards', () => {
  it('blocks snapshot persist when GET failed', () => {
    assert.equal(allowSupplySnapshotPersist(false), false)
    assert.equal(allowSupplySnapshotPersist(true), true)
  })

  it('blocks catalogue sync when GET failed', () => {
    assert.equal(allowSupplyCatalogSync(false), false)
    assert.equal(allowSupplyCatalogSync(true), true)
  })

  it('does not treat a failed snapshot GET as empty cloud for catch-up upload', () => {
    assert.equal(
      shouldCatchupUploadAfterHydrate({
        snapshotLoadOk: false,
        localLen: 12,
        remoteLen: 0,
      }),
      false,
    )
    assert.equal(
      shouldCatchupUploadAfterHydrate({
        snapshotLoadOk: true,
        localLen: 12,
        remoteLen: 0,
      }),
      true,
    )
    assert.equal(
      shouldCatchupUploadAfterHydrate({
        snapshotLoadOk: true,
        localLen: 3,
        remoteLen: 3,
      }),
      false,
    )
  })

  it('recovers local catalogue only after a successful empty GET', () => {
    assert.equal(
      shouldRecoverLocalCatalogToCloud({
        catalogLoadOk: false,
        remoteCatalogLen: 0,
        localCatalogLen: 40,
      }),
      false,
    )
    assert.equal(
      shouldRecoverLocalCatalogToCloud({
        catalogLoadOk: true,
        remoteCatalogLen: 0,
        localCatalogLen: 40,
      }),
      true,
    )
    assert.equal(
      shouldRecoverLocalCatalogToCloud({
        catalogLoadOk: true,
        remoteCatalogLen: 8,
        localCatalogLen: 40,
      }),
      false,
    )
  })

  it('skips empty PUT over live kitchen / bar / recipe snapshots', () => {
    const liveKitchen = [{ id: 'ks-jollof', availablePortions: 25 }]
    assert.equal(
      shouldSkipEmptySnapshotOverwrite('kitchen_stock', [], liveKitchen),
      true,
    )
    assert.equal(
      shouldSkipEmptySnapshotOverwrite('bar_stock', [], [{ id: 'bar-1' }]),
      true,
    )
    assert.equal(
      shouldSkipEmptySnapshotOverwrite('recipes', [], [{ id: 'r1' }]),
      true,
    )
    assert.equal(
      shouldSkipEmptySnapshotOverwrite('kitchen_stock', liveKitchen, liveKitchen),
      false,
    )
    assert.equal(
      shouldSkipEmptySnapshotOverwrite('kitchen_stock', [], []),
      false,
    )
    assert.equal(
      shouldSkipEmptySnapshotOverwrite('basket', [], [{ id: 'line-1' }]),
      false,
    )
  })
})
