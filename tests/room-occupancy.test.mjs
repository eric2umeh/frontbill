import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const today = '2026-06-10'

function bookingYmdHotel(value) {
  if (!value) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  const match = String(value).trim().match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? ''
}

function loadRoomOccupancyModule() {
  const source = readFileSync(resolve(repoRoot, 'lib/rooms/room-occupancy.ts'), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText

  const module = { exports: {} }
  const dependencies = {
    '@/lib/hotel-date': {
      resolveHotelTimeZone: () => 'UTC',
    },
    '@/lib/utils/booking-in-house-dates': {
      bookingYmdHotel,
      todayYmdHotel: () => today,
      isInHouseOnCalendarDay: (checkIn, checkOut, todayYmd = today) => {
        const ci = bookingYmdHotel(checkIn)
        const co = bookingYmdHotel(checkOut)
        return Boolean(ci && co && ci <= todayYmd && co >= todayYmd)
      },
    },
  }

  vm.runInNewContext(
    transpiled,
    {
      console,
      exports: module.exports,
      module,
      require: (specifier) => {
        const dependency = dependencies[specifier]
        if (!dependency) throw new Error(`Unexpected dependency: ${specifier}`)
        return dependency
      },
    },
    { filename: 'room-occupancy.cjs' },
  )

  return module.exports
}

function queryResult(result) {
  const builder = {
    eq: () => builder,
    in: () => builder,
    select: () => builder,
    then: (resolvePromise, rejectPromise) => Promise.resolve(result).then(resolvePromise, rejectPromise),
  }
  return builder
}

function createMockSupabase({ rooms, bookings, updates }) {
  return {
    from(table) {
      if (table === 'rooms') {
        return {
          select: () => queryResult({ data: rooms, error: null }),
          update: (payload) => ({
            eq: (column, value) => {
              updates.push({ table, payload, column, value })
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      if (table === 'bookings') {
        return {
          select: () => queryResult({ data: bookings, error: null }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

test('future reservations keep rooms.status reserved during reconciliation', async () => {
  const { reconcileRoomStatusesForOrganization } = loadRoomOccupancyModule()
  const updates = []
  const supabase = createMockSupabase({
    updates,
    rooms: [{ id: 'room-101', status: 'reserved' }],
    bookings: [
      {
        id: 'booking-future',
        room_id: 'room-101',
        status: 'reserved',
        check_in: '2026-06-15',
        check_out: '2026-06-20',
        folio_status: 'active',
      },
    ],
  })

  const result = await reconcileRoomStatusesForOrganization(supabase, 'org-1')

  assert.equal(result.updated, 0)
  assert.deepEqual(updates, [])
})

test('stale past reservations are still freed during reconciliation', async () => {
  const { reconcileRoomStatusesForOrganization } = loadRoomOccupancyModule()
  const updates = []
  const supabase = createMockSupabase({
    updates,
    rooms: [{ id: 'room-102', status: 'reserved' }],
    bookings: [
      {
        id: 'booking-past',
        room_id: 'room-102',
        status: 'reserved',
        check_in: '2026-06-01',
        check_out: '2026-06-05',
        folio_status: 'active',
      },
    ],
  })

  const result = await reconcileRoomStatusesForOrganization(supabase, 'org-1')

  assert.equal(result.updated, 1)
  assert.equal(result.freed, 1)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].table, 'rooms')
  assert.equal(updates[0].value, 'room-102')
  assert.equal(updates[0].payload.status, 'available')
})

test('housekeeping cleaning status is preserved during reconciliation', async () => {
  const { reconcileRoomStatusesForOrganization } = loadRoomOccupancyModule()
  const updates = []
  const supabase = createMockSupabase({
    updates,
    rooms: [{ id: 'room-103', status: 'cleaning' }],
    bookings: [],
  })

  const result = await reconcileRoomStatusesForOrganization(supabase, 'org-1')

  assert.equal(result.updated, 0)
  assert.deepEqual(updates, [])
})

test('future holds do not become outlet charge-to-room occupants', () => {
  const { pickOccupyingBooking, pickRoomStatusBooking } = loadRoomOccupancyModule()
  const futureBooking = {
    id: 'booking-future',
    room_id: 'room-104',
    status: 'reserved',
    check_in: '2026-06-15',
    check_out: '2026-06-20',
    folio_status: 'active',
  }

  assert.equal(pickOccupyingBooking([futureBooking]), null)
  assert.equal(pickRoomStatusBooking([futureBooking])?.id, 'booking-future')
})
