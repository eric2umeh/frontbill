import assert from 'node:assert/strict'
import test from 'node:test'

import { isMatchingApprovedBackdateRequest } from '../lib/backdate/approval-match'
import { buildBackdateDedupeKey, buildBackdateIntentFingerprint } from '../lib/backdate/dedupe-key'

test('matches only approved requests with the exact type and dedupe key', () => {
  const dedupeKey = 'org|staff|booking|2026-01-01|2026-01-02|payload-a'

  assert.equal(
    isMatchingApprovedBackdateRequest(
      { status: 'approved', request_type: 'booking', dedupe_key: dedupeKey },
      { requestType: 'booking', dedupeKey },
    ),
    true,
  )

  assert.equal(
    isMatchingApprovedBackdateRequest(
      {
        status: 'approved',
        request_type: 'booking',
        dedupe_key: 'different-key',
      },
      { requestType: 'booking', dedupeKey },
    ),
    false,
  )

  assert.equal(
    isMatchingApprovedBackdateRequest(
      { status: 'approved', request_type: 'reservation', dedupe_key: dedupeKey },
      { requestType: 'booking', dedupeKey },
    ),
    false,
  )

  assert.equal(
    isMatchingApprovedBackdateRequest(
      { status: 'pending', request_type: 'booking', dedupe_key: dedupeKey },
      { requestType: 'booking', dedupeKey },
    ),
    false,
  )
})

test('intent fingerprints make same-room same-date booking approvals payload-specific', () => {
  const base = {
    guest: { guest_id: null, full_name: 'Ada Guest' },
    room_id: 'room-101',
    check_in: '2026-01-01',
    check_out: '2026-01-02',
    price_per_night: 25000,
    payment_method: 'cash',
  }

  const originalKey = buildBackdateDedupeKey({
    organizationId: 'org-1',
    requestedBy: 'staff-1',
    requestType: 'booking',
    requestedCheckIn: base.check_in,
    requestedCheckOut: base.check_out,
    roomId: base.room_id,
    intentFingerprint: buildBackdateIntentFingerprint(base),
  })
  const changedGuestKey = buildBackdateDedupeKey({
    organizationId: 'org-1',
    requestedBy: 'staff-1',
    requestType: 'booking',
    requestedCheckIn: base.check_in,
    requestedCheckOut: base.check_out,
    roomId: base.room_id,
    intentFingerprint: buildBackdateIntentFingerprint({
      ...base,
      guest: { guest_id: null, full_name: 'Different Guest' },
    }),
  })

  assert.notEqual(changedGuestKey, originalKey)
})

test('intent fingerprints are stable for equivalent reservation metadata', () => {
  const metadataA = {
    room_id: 'room-101',
    guest_name: 'Ada Guest',
    amount_paid: 10000,
    payment_status: 'partial',
  }
  const metadataB = {
    payment_status: 'partial',
    amount_paid: 10000,
    guest_name: 'Ada Guest',
    room_id: 'room-101',
  }

  assert.equal(buildBackdateIntentFingerprint(metadataA), buildBackdateIntentFingerprint(metadataB))
})
