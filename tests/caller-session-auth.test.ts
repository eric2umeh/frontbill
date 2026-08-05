import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callerMatchesSession } from '../lib/api/caller-session-match'

describe('callerMatchesSession', () => {
  it('rejects missing caller or session', () => {
    assert.equal(callerMatchesSession(null, 'user-1'), false)
    assert.equal(callerMatchesSession('user-1', null), false)
    assert.equal(callerMatchesSession('', 'user-1'), false)
    assert.equal(callerMatchesSession('user-1', ''), false)
    assert.equal(callerMatchesSession(undefined, undefined), false)
  })

  it('rejects spoofed caller_id that does not match the session', () => {
    assert.equal(callerMatchesSession('admin-uuid', 'attacker-uuid'), false)
  })

  it('accepts only an exact session match', () => {
    assert.equal(callerMatchesSession('admin-uuid', 'admin-uuid'), true)
  })
})
