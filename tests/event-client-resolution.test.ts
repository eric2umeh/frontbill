import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveEventClientRecord } from '../lib/events/resolve-event-client'

type TableRows = Record<string, Array<Record<string, unknown>>>

function makeMockAdmin(tables: TableRows) {
  return {
    from(tableName: string) {
      const filters: Array<{ column: string; value: unknown }> = []
      const query = {
        select() {
          return query
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value })
          return query
        },
        async single() {
          const row = (tables[tableName] || []).find((candidate) =>
            filters.every((filter) => candidate[filter.column] === filter.value),
          )
          if (!row) return { data: null, error: { message: 'not found' } }
          return { data: row, error: null }
        },
      }
      return query
    },
  }
}

test('rejects event client organization IDs created by another hotel tenant', async () => {
  const admin = makeMockAdmin({
    organizations: [
      {
        id: 'org-external',
        name: 'External Corp',
        phone: '08000000000',
        email: 'external@example.com',
        org_type: 'private',
        created_by: 'external-user',
      },
    ],
    profiles: [{ id: 'external-user', organization_id: 'external-hotel' }],
  })

  const result = await resolveEventClientRecord(admin as never, {
    hotelOrganizationId: 'current-hotel',
    userId: 'current-user',
    clientType: 'organization',
    clientName: 'External Corp',
    clientOrganizationId: 'org-external',
  })

  assert.deepEqual(result, { error: 'Organization not found' })
})

test('accepts event client organization IDs created by the same hotel tenant', async () => {
  const admin = makeMockAdmin({
    organizations: [
      {
        id: 'org-local',
        name: 'Local Corp',
        phone: '08111111111',
        email: 'local@example.com',
        org_type: 'private',
        created_by: 'local-user',
      },
    ],
    profiles: [{ id: 'local-user', organization_id: 'current-hotel' }],
  })

  const result = await resolveEventClientRecord(admin as never, {
    hotelOrganizationId: 'current-hotel',
    userId: 'current-user',
    clientType: 'organization',
    clientName: 'Local Corp',
    clientOrganizationId: 'org-local',
    clientPhone: 'ignored-phone',
    clientEmail: 'ignored@example.com',
  })

  assert.deepEqual(result, {
    data: {
      client_type: 'organization',
      client_name: 'Local Corp',
      client_phone: '08111111111',
      client_email: 'local@example.com',
      guest_id: null,
      client_organization_id: 'org-local',
    },
  })
})
