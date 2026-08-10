import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hotelBusinessNightUtcBounds } from '../lib/payments/business-night-bounds.ts'

const TZ = 'Africa/Lagos'

describe('hotelBusinessNightUtcBounds', () => {
  it('starts the next business night at a pre-midnight prior audit (no payment gap)', () => {
    // Night of 2026-08-09 closed at 20:00 Lagos (pre-midnight audit is supported after 18:00).
    const prevAuditIso = '2026-08-09T19:00:00.000Z' // 20:00 Lagos (UTC+1)
    const now = new Date('2026-08-10T10:00:00.000Z') // mid-morning next calendar day

    const bounds = hotelBusinessNightUtcBounds({
      ymd: '2026-08-10',
      timeZone: TZ,
      now,
      orgBusinessDate: '2026-08-10',
      previousAuditCompletedAt: prevAuditIso,
      thisAuditCompletedAt: null,
    })

    assert.equal(bounds.empty, false)
    assert.equal(bounds.mode, 'open_until_now')
    assert.equal(bounds.startIso, prevAuditIso)

    // Cash taken at 21:30 Lagos on Aug 9 (after audit, before midnight) must fall inside Aug 10's night.
    const postAuditPayment = new Date('2026-08-09T20:30:00.000Z').getTime() // 21:30 Lagos
    assert.ok(postAuditPayment >= new Date(bounds.startIso).getTime())
    assert.ok(postAuditPayment <= new Date(bounds.endInclusiveIso).getTime())
  })

  it('still uses prior audit when it is after midnight (morning audit)', () => {
    // Aug 9 night closed at 07:00 Lagos on Aug 10.
    const prevAuditIso = '2026-08-10T06:00:00.000Z' // 07:00 Lagos
    const now = new Date('2026-08-10T12:00:00.000Z')

    const bounds = hotelBusinessNightUtcBounds({
      ymd: '2026-08-10',
      timeZone: TZ,
      now,
      orgBusinessDate: '2026-08-10',
      previousAuditCompletedAt: prevAuditIso,
      thisAuditCompletedAt: null,
    })

    assert.equal(bounds.empty, false)
    assert.equal(bounds.startIso, prevAuditIso)
  })

  it('falls back to calendar midnight when there is no prior audit', () => {
    const now = new Date('2026-08-10T12:00:00.000Z')
    const bounds = hotelBusinessNightUtcBounds({
      ymd: '2026-08-10',
      timeZone: TZ,
      now,
      orgBusinessDate: '2026-08-10',
      previousAuditCompletedAt: null,
      thisAuditCompletedAt: null,
    })

    assert.equal(bounds.empty, false)
    // Africa/Lagos UTC+1 → 2026-08-10 00:00 = 2026-08-09T23:00:00.000Z
    assert.equal(bounds.startIso, '2026-08-09T23:00:00.000Z')
  })

  it('closed night ends at this audit and does not overlap the next start', () => {
    const auditClick = '2026-08-09T19:00:00.000Z' // 20:00 Lagos
    const closed = hotelBusinessNightUtcBounds({
      ymd: '2026-08-09',
      timeZone: TZ,
      now: new Date('2026-08-10T12:00:00.000Z'),
      orgBusinessDate: '2026-08-10',
      previousAuditCompletedAt: '2026-08-08T19:00:00.000Z',
      thisAuditCompletedAt: auditClick,
    })
    const next = hotelBusinessNightUtcBounds({
      ymd: '2026-08-10',
      timeZone: TZ,
      now: new Date('2026-08-10T12:00:00.000Z'),
      orgBusinessDate: '2026-08-10',
      previousAuditCompletedAt: auditClick,
      thisAuditCompletedAt: null,
    })

    assert.equal(closed.mode, 'closed_at_audit')
    assert.equal(closed.endExclusiveIso, auditClick)
    assert.equal(next.startIso, auditClick)
    assert.ok(new Date(closed.endInclusiveIso).getTime() < new Date(next.startIso).getTime())
  })
})
