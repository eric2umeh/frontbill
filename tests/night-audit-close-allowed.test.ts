import assert from 'node:assert/strict'
import test from 'node:test'
import { nightAuditCloseAllowed } from '../lib/hotel-date.ts'

test('closes the open business date', () => {
  const result = nightAuditCloseAllowed({
    closingDate: '2026-11-03',
    openBusinessDate: '2026-11-03',
    suggestedClosingDate: '2026-11-05',
  })
  assert.deepEqual(result, { ok: true })
})

test('rejects the morning default when it skips the open night', () => {
  // Last close left the hotel on Tuesday. Thursday morning defaults to Wednesday.
  const result = nightAuditCloseAllowed({
    closingDate: '2026-11-04',
    openBusinessDate: '2026-11-03',
    suggestedClosingDate: '2026-11-04',
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.error, /2026-11-03/)
    assert.match(result.error, /skip or rewind/)
  }
})

test('rejects an older date that would rewind the hotel date', () => {
  const result = nightAuditCloseAllowed({
    closingDate: '2026-10-01',
    openBusinessDate: '2026-11-06',
    suggestedClosingDate: '2026-11-05',
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /2026-11-06/)
})

test('first audit may close only the suggested business night', () => {
  assert.deepEqual(
    nightAuditCloseAllowed({
      closingDate: '2026-11-05',
      openBusinessDate: null,
      suggestedClosingDate: '2026-11-05',
    }),
    { ok: true },
  )

  const rewind = nightAuditCloseAllowed({
    closingDate: '2026-01-01',
    openBusinessDate: null,
    suggestedClosingDate: '2026-11-05',
  })
  assert.equal(rewind.ok, false)
  if (!rewind.ok) assert.match(rewind.error, /2026-11-05/)
})

test('ignores a non-date stored business date and uses the suggestion', () => {
  const result = nightAuditCloseAllowed({
    closingDate: '2026-11-05',
    openBusinessDate: 'not-a-date',
    suggestedClosingDate: '2026-11-05',
  })
  assert.deepEqual(result, { ok: true })
})
