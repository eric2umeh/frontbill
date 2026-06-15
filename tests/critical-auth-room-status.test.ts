import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDashboardUserResultFromProfile,
  type ProfileRow,
} from '../lib/auth/load-dashboard-user'
import { applyRoomStatusUpdate } from '../lib/rooms/update-room-status'

type RoomRow = {
  id: string
  organization_id: string
  room_number: string
  status: string
}

type BookingRow = {
  id: string
  organization_id: string
  room_id: string
  status: string
  check_in: string
  check_out: string
  folio_status?: string | null
}

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = []
  private inFilters: Array<{ column: string; values: unknown[] }> = []
  private operation: 'select' | 'update' | 'insert' = 'select'
  private updatePatch: Record<string, unknown> | null = null
  private insertPayload: Record<string, unknown> | null = null

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select() {
    this.operation = 'select'
    return this
  }

  update(patch: Record<string, unknown>) {
    this.operation = 'update'
    this.updatePatch = patch
    return this
  }

  insert(payload: Record<string, unknown>) {
    this.operation = 'insert'
    this.insertPayload = payload
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value })
    return this
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push({ column, values })
    return this
  }

  maybeSingle() {
    const result = this.execute()
    return Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
      error: result.error,
    })
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute(): { data: unknown; error: { message: string } | null } {
    if (this.operation === 'insert') {
      this.db.inserts.push({ table: this.table, payload: this.insertPayload ?? {} })
      return { data: null, error: null }
    }

    if (this.operation === 'update') {
      if (this.table !== 'rooms' || !this.updatePatch) {
        return { data: null, error: null }
      }

      this.db.updates.push({ table: this.table, patch: this.updatePatch })
      for (const room of this.db.rooms) {
        if (this.matches(room)) {
          Object.assign(room, this.updatePatch)
        }
      }
      return { data: null, error: null }
    }

    if (this.table === 'rooms') {
      return { data: this.db.rooms.filter((room) => this.matches(room)), error: null }
    }

    if (this.table === 'bookings') {
      return { data: this.db.bookings.filter((booking) => this.matches(booking)), error: null }
    }

    return { data: [], error: null }
  }

  private matches(row: Record<string, unknown>) {
    return (
      this.filters.every(({ column, value }) => row[column] === value) &&
      this.inFilters.every(({ column, values }) => values.includes(row[column]))
    )
  }
}

class FakeSupabase {
  readonly updates: Array<{ table: string; patch: Record<string, unknown> }> = []
  readonly inserts: Array<{ table: string; payload: Record<string, unknown> }> = []

  constructor(
    readonly rooms: RoomRow[],
    readonly bookings: BookingRow[],
  ) {}

  from(table: string) {
    return new FakeQuery(this, table)
  }
}

test('dashboard auth fails closed when no profile is available', () => {
  const result = buildDashboardUserResultFromProfile({
    userId: 'user-1',
    email: 'staff@example.com',
    profile: null,
    metadataRole: null,
  })

  assert.deepEqual(result, { status: 'forbidden' })
})

test('dashboard auth does not trust metadata role without a profile', () => {
  const result = buildDashboardUserResultFromProfile({
    userId: 'user-1',
    email: 'staff@example.com',
    profile: null,
    metadataRole: 'admin',
  })

  assert.deepEqual(result, { status: 'forbidden' })
})

test('dashboard auth still accepts a valid profile role', () => {
  const profile: ProfileRow = {
    full_name: 'Front Desk',
    role: 'staff',
    organization_id: 'org-1',
  }

  const result = buildDashboardUserResultFromProfile({
    userId: 'user-1',
    email: 'staff@example.com',
    profile,
    metadataRole: null,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.status === 'ok' ? result.user.role : '', 'staff')
  assert.equal(result.status === 'ok' ? result.user.organizationId : '', 'org-1')
})

test('room status update rejects clearing an active in-house room', async () => {
  const db = new FakeSupabase(
    [{ id: 'room-1', organization_id: 'org-1', room_number: '101', status: 'occupied' }],
    [
      {
        id: 'booking-1',
        organization_id: 'org-1',
        room_id: 'room-1',
        status: 'checked_in',
        check_in: '2026-06-14',
        check_out: '2026-06-16',
        folio_status: 'active',
      },
    ],
  )

  const result = await applyRoomStatusUpdate(db as never, {
    organizationId: 'org-1',
    roomId: 'room-1',
    roomNumber: '101',
    newStatus: 'available',
    source: 'housekeeping',
    userId: 'user-1',
    userName: 'Housekeeper',
  })

  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.message, /active in-house booking/)
  assert.equal(db.rooms[0].status, 'occupied')
  assert.equal(db.updates.length, 0)
  assert.equal(db.inserts.length, 0)
})

test('room status update allows clearing when no active room booking exists', async () => {
  const db = new FakeSupabase(
    [{ id: 'room-1', organization_id: 'org-1', room_number: '101', status: 'cleaning' }],
    [],
  )

  const result = await applyRoomStatusUpdate(db as never, {
    organizationId: 'org-1',
    roomId: 'room-1',
    roomNumber: '101',
    newStatus: 'available',
    source: 'housekeeping',
    userId: 'user-1',
    userName: 'Housekeeper',
  })

  assert.deepEqual(result, { ok: true, status: 'available' })
  assert.equal(db.rooms[0].status, 'available')
  assert.equal(db.updates.length, 1)
  assert.equal(db.inserts.length, 1)
  assert.equal(db.inserts[0].table, 'housekeeping_tasks')
})

test('063 restores self-profile reads without reviving org-wide recursion', async () => {
  const sql = await readFile(
    new URL('../scripts/063_restore_profiles_self_select_rls.sql', import.meta.url),
    'utf8',
  )

  assert.match(
    sql,
    /CREATE POLICY "Profiles are viewable by the user" ON public\.profiles\s+FOR SELECT USING \(auth\.uid\(\) = id\);/,
  )
  assert.doesNotMatch(sql, /Profiles are viewable by org members/)
  assert.doesNotMatch(sql, /organization_id IN\s*\(/)
})
