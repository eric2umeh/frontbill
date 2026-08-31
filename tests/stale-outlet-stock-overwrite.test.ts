import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeBarStockFromRemote } from '@/lib/supply-chain/bar-stock-normalize'
import { mergeKitchenStockPair } from '@/lib/supply-chain/kitchen-sync-merge'
import {
  bulkSnapshotsPayloadForRole,
  snapshotsPayloadForRole,
} from '@/lib/supply-chain/supply-snapshot-payload'
import { resolveOutletItemStock } from '@/lib/outlets/outlet-supply-stock'
import type { BarStockItem, KitchenStockItem } from '@/lib/supply-chain/types'
import type { OutletMenuItemRow } from '@/lib/outlets/types'

function barRow(storeItemId: string, qty: number, name = 'Heineken'): BarStockItem {
  return {
    id: `bar-${storeItemId}`,
    storeItemId,
    name,
    quantityOnHand: qty,
    reorderLevel: 6,
    unitsPerSale: 1,
    unit: 'bottle',
  }
}

function kitchenRow(
  id: string,
  name: string,
  availablePortions: number,
): KitchenStockItem {
  return {
    id,
    name,
    source: 'produced',
    availablePortions,
    reorderLevel: 4,
  }
}

function menuItem(name: string, serviceCode: string): OutletMenuItemRow {
  return {
    id: 'mi-1',
    organization_id: 'org-1',
    category_id: null,
    department: 'restaurant',
    name,
    description: '',
    unit_price: 2500,
    sku: null,
    tags: [],
    is_active: true,
    sort_order: 0,
    service_code: serviceCode,
    created_at: '',
    updated_at: '',
  }
}

describe('bar stock hydrate vs live merge', () => {
  it('hydrate prefers cloud qty over stale local backup (sales already deducted)', () => {
    const merged = mergeBarStockFromRemote(
      [barRow('heineken', 24)],
      [barRow('heineken', 14)],
      { preferRemote: true },
    )
    assert.equal(merged[0]?.quantityOnHand, 14)
  })

  it('hydrate prefers cloud sold-out 0 over leftover local qty', () => {
    const merged = mergeBarStockFromRemote(
      [barRow('heineken', 12)],
      [barRow('heineken', 0)],
      { preferRemote: true },
    )
    assert.equal(merged[0]?.quantityOnHand, 0)
  })

  it('keeps this device qty for a few seconds after a local count or sale', () => {
    const merged = mergeBarStockFromRemote(
      [barRow('heineken', 8)],
      [barRow('heineken', 14)],
      { preferLocalRecent: true },
    )
    assert.equal(merged[0]?.quantityOnHand, 8)
  })
})

describe('kitchen finished-stock merge', () => {
  it('takes cloud 0 so a chef count-out reaches POS instead of resurrecting local portions', () => {
    const merged = mergeKitchenStockPair(
      kitchenRow('ks-jollof', 'Jollof Rice', 50),
      kitchenRow('ks-jollof', 'Jollof Rice', 0),
    )
    assert.equal(merged.availablePortions, 0)
  })

  it('keeps a just-edited local count while preferLocalRecent is set', () => {
    const merged = mergeKitchenStockPair(
      kitchenRow('ks-jollof', 'Jollof Rice', 50),
      kitchenRow('ks-jollof', 'Jollof Rice', 0),
      { preferLocalRecent: true },
    )
    assert.equal(merged.availablePortions, 50)
  })
})

describe('outlet bulk snapshot persist', () => {
  const all = {
    bar_stock: [barRow('heineken', 3)],
    kitchen_stock: [kitchenRow('ks-jollof', 'Jollof Rice', 20)],
    activity_log: [{ id: 'a1' }],
  }

  it('targeted persist still allows cashier to PUT bar_stock alone', () => {
    const payload = snapshotsPayloadForRole({ bar_stock: all.bar_stock }, 'cashier')
    assert.ok('bar_stock' in payload)
    assert.ok(!('kitchen_stock' in payload))
  })

  it('debounced full persist from Main Bar must not include stale kitchen_stock', () => {
    const payload = bulkSnapshotsPayloadForRole(all, 'cashier')
    assert.ok(!('bar_stock' in payload))
    assert.ok(!('kitchen_stock' in payload))
    assert.ok('activity_log' in payload)
  })

  it('chef bulk persist still includes kitchen_stock', () => {
    const payload = bulkSnapshotsPayloadForRole(all, 'chef')
    assert.ok('kitchen_stock' in payload)
  })
})

describe('restaurant linked stock sold-out', () => {
  it('does not sell Rice from Jollof Rice when the linked Rice row is at 0', () => {
    const stock = [
      kitchenRow('ks-rice', 'Rice', 0),
      kitchenRow('ks-jollof', 'Jollof Rice', 30),
    ]
    const link = resolveOutletItemStock(
      menuItem('Rice', 'ks:ks-rice'),
      'restaurant',
      stock,
      [],
    )
    assert.equal(link.stockId, 'ks-rice')
    assert.equal(link.available, 0)
  })

  it('falls back to exact name when the linked kitchen row id is missing', () => {
    const stock = [kitchenRow('ks-rice-new', 'Rice', 12)]
    const link = resolveOutletItemStock(
      menuItem('Rice', 'ks:ks-rice-old'),
      'restaurant',
      stock,
      [],
    )
    assert.equal(link.stockId, 'ks-rice-new')
    assert.equal(link.available, 12)
  })
})
