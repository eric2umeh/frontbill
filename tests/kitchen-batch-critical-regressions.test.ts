import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveKitchenBatchIdentity } from '../lib/supply-chain/kitchen-batch-identity'
import { requireCatalogSyncPermission } from '../app/api/supply/catalog/sync/route'
import type { KitchenStockItem, Recipe } from '../lib/supply-chain/types'

test('saving an existing named batch preserves the recipe id and linked kitchen stock row', () => {
  const recipes: Recipe[] = [
    {
      id: 'legacy-recipe-id',
      name: 'Chicken Stock',
      category: 'Prep',
      yieldPortions: 10,
      yieldUnit: 'l',
      yieldLabel: '10 l',
      ingredients: [],
      overheadCost: 0,
      sellingPricePerPortion: 0,
    },
  ]
  const kitchenStock: KitchenStockItem[] = [
    {
      id: 'legacy-stock-id',
      name: 'Chicken Stock',
      source: 'produced',
      availablePortions: 4,
      unit: 'l',
      reorderLevel: 2,
      linkedRecipeId: 'legacy-recipe-id',
    },
  ]

  const identity = resolveKitchenBatchIdentity({
    batchName: 'Chicken Stock',
    requestedKitchenStockId: 'ks-chicken-stock',
    recipes,
    kitchenStock,
  })

  assert.deepEqual(identity, {
    recipeId: 'legacy-recipe-id',
    kitchenStockId: 'legacy-stock-id',
  })
})

test('new batch identity uses requested stock row while deriving a slug recipe id', () => {
  const identity = resolveKitchenBatchIdentity({
    batchName: 'Jollof Rice 1kg',
    requestedKitchenStockId: 'ks-menu-row-123',
    recipes: [],
    kitchenStock: [],
  })

  assert.deepEqual(identity, {
    recipeId: 'rcp-jollof-rice-1kg',
    kitchenStockId: 'ks-menu-row-123',
  })
})

test('bulk catalog sync rejects authenticated users without store access', () => {
  const denied = requireCatalogSyncPermission({
    userId: 'user-1',
    orgId: 'org-1',
    role: 'front_desk',
  })

  assert.equal(denied?.status, 403)
  assert.equal(
    requireCatalogSyncPermission({
      userId: 'user-2',
      orgId: 'org-1',
      role: 'admin',
    }),
    null,
  )
})
