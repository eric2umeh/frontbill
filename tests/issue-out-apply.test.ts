import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createSnapshotWriteQueue,
  creditBarStockOnIssue,
  creditKitchenRawOnIssue,
  decrementStoreOnHand,
} from '../lib/supply-chain/issue-out-apply.ts'
import type { BarStockItem } from '../lib/supply-chain/types.ts'

const beer = {
  id: 'si-beer',
  name: 'Beer',
  unit: 'bottle',
  reorderLevel: 6,
  quantityInStore: 10,
}
const vodka = {
  id: 'si-vodka',
  name: 'Vodka',
  unit: 'bottle',
  reorderLevel: 4,
  quantityInStore: 8,
}

describe('multi-line issue-out stock', () => {
  it('keeps every bar line when issues are applied in order', () => {
    let bar: BarStockItem[] = []
    let store = [beer, vodka]
    const closedOver: BarStockItem[][] = []

    for (const line of [
      { store: beer, qty: 2 },
      { store: vodka, qty: 3 },
    ]) {
      store = decrementStoreOnHand(store, line.store.id, line.qty)
      bar = creditBarStockOnIssue(bar, line.store, line.qty)
      closedOver.push(bar)
    }

    assert.equal(closedOver[0].length, 1)
    assert.equal(closedOver[0][0].quantityOnHand, 2)
    assert.equal(bar.length, 2)
    assert.equal(bar.find((row) => row.storeItemId === 'si-beer')?.quantityOnHand, 2)
    assert.equal(bar.find((row) => row.storeItemId === 'si-vodka')?.quantityOnHand, 3)
    assert.equal(store.find((row) => row.id === 'si-beer')?.quantityInStore, 8)
    assert.equal(store.find((row) => row.id === 'si-vodka')?.quantityInStore, 5)
    // The cloud write must use the array after the whole cart, not the first line.
    const persisted = closedOver.map(() => bar)
    assert.equal(persisted[0].length, 2)
    assert.equal(persisted[1].length, 2)
  })

  it('adds a second issue of the same bar item on top of the first', () => {
    const once = creditBarStockOnIssue([], beer, 2)
    const twice = creditBarStockOnIssue(once, beer, 3)
    assert.equal(twice.length, 1)
    assert.equal(twice[0].id, 'bar-si-beer')
    assert.equal(twice[0].quantityOnHand, 5)
  })

  it('credits kitchen raw stock for each issued item', () => {
    const rice = { id: 'si-rice', name: 'Rice', unit: 'kg', reorderLevel: 2 }
    const oil = { id: 'si-oil', name: 'Oil', unit: 'ltr', reorderLevel: 1 }
    const afterRice = creditKitchenRawOnIssue([], rice, 4)
    const afterBoth = creditKitchenRawOnIssue(afterRice, oil, 1)
    assert.deepEqual(
      afterBoth.map((row) => [row.storeItemId, row.quantityOnHand]),
      [
        ['si-rice', 4],
        ['si-oil', 1],
      ],
    )
  })
})

describe('createSnapshotWriteQueue', () => {
  it('finishes an earlier snapshot write before a later one starts', async () => {
    const queue = createSnapshotWriteQueue()
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = queue(async () => {
      order.push('first-start')
      await gate
      order.push('first-end')
      return 'partial'
    })
    const second = queue(async () => {
      order.push('second-start')
      return 'final'
    })

    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(order, ['first-start'])
    releaseFirst()
    assert.equal(await first, 'partial')
    assert.equal(await second, 'final')
    assert.deepEqual(order, ['first-start', 'first-end', 'second-start'])
  })
})
