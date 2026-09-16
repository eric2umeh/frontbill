import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  omitEmptyAuditSnapshots,
  shouldSkipEmptyAuditSnapshotOverwrite,
} from '../lib/supply-chain/audit-snapshot-guard'

const liveIssueOut = [{ id: 'io-1', destination: 'Kitchen', issuedAt: '2026-09-16T10:00:00.000Z' }]
const liveActivity = [{ id: 'act-1', summary: 'Issued rice to kitchen' }]

describe('empty audit snapshot overwrite guard', () => {
  it('blocks empty issue-out PUT over a live org log', () => {
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('issue_out_log', [], liveIssueOut),
      true,
    )
  })

  it('blocks empty activity-log PUT over a live org trail', () => {
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('activity_log', [], liveActivity),
      true,
    )
  })

  it('allows the first write when cloud audit logs are still empty', () => {
    assert.equal(shouldSkipEmptyAuditSnapshotOverwrite('issue_out_log', [], []), false)
    assert.equal(shouldSkipEmptyAuditSnapshotOverwrite('activity_log', [], []), false)
    assert.equal(shouldSkipEmptyAuditSnapshotOverwrite('activity_log', [], undefined), false)
  })

  it('allows non-empty audit upserts', () => {
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('issue_out_log', liveIssueOut, liveIssueOut),
      false,
    )
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('activity_log', liveActivity, []),
      false,
    )
  })

  it('does not change basket or purchase-order empty-win behaviour', () => {
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('basket', [], [{ id: 'line-1' }]),
      false,
    )
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('purchase_orders', [], [{ id: 'po-1' }]),
      false,
    )
    assert.equal(
      shouldSkipEmptyAuditSnapshotOverwrite('kitchen_stock', [], [{ id: 'ks-1' }]),
      false,
    )
  })
})

describe('omitEmptyAuditSnapshots', () => {
  it('strips empty audit keys from a persist payload', () => {
    const payload = omitEmptyAuditSnapshots({
      issue_out_log: [],
      activity_log: [],
      basket: [],
      kitchen_stock: [{ id: 'ks-1' }],
    })
    assert.equal('issue_out_log' in payload, false)
    assert.equal('activity_log' in payload, false)
    assert.deepEqual(payload.basket, [])
    assert.deepEqual(payload.kitchen_stock, [{ id: 'ks-1' }])
  })

  it('keeps populated audit logs', () => {
    const payload = omitEmptyAuditSnapshots({
      issue_out_log: liveIssueOut,
      activity_log: liveActivity,
    })
    assert.deepEqual(payload.issue_out_log, liveIssueOut)
    assert.deepEqual(payload.activity_log, liveActivity)
  })
})
