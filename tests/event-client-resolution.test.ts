import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveEventClientRecord } from '../lib/events/resolve-event-client'

type MockRow = Record<string, unknown> | null

function createAdminMock({
  organization,
  creatorProfile,
}: {
  organization: MockRow
  creatorProfile: MockRow
}): SupabaseClient {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              if (table === 'organizations') {
                return {
                  async single() {
                    return organization
                      ? { data: organization, error: null }
                      : { data: null, error: { message: 'not found' } }
                  },
                }
              }
              if (table === 'profiles') {
                return {
                  async maybeSingle() {
                    return { data: creatorProfile, error: null }
                  },
                }
              }
              throw new Error(`Unexpected table ${table}`)
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

describe('resolveEventClientRecord organization clients', () => {
  const baseInput = {
    hotelOrganizationId: 'hotel-1',
    userId: 'user-1',
    clientType: 'organization' as const,
    clientName: 'Ignored Client Name',
    clientOrganizationId: 'org-1',
  }

  it('resolves an organization created by a user in the same hotel', async () => {
    const admin = createAdminMock({
      organization: {
        id: 'org-1',
        name: 'Acme Ltd',
        phone: '08000000000',
        email: 'events@acme.example',
        org_type: 'corporate',
        created_by: 'creator-1',
      },
      creatorProfile: { organization_id: 'hotel-1' },
    })

    const result = await resolveEventClientRecord(admin, baseInput)

    assert.deepEqual(result, {
      data: {
        client_type: 'organization',
        client_name: 'Acme Ltd',
        client_phone: '08000000000',
        client_email: 'events@acme.example',
        guest_id: null,
        client_organization_id: 'org-1',
      },
    })
  })

  it('rejects an organization ID from another hotel before copying its contact data', async () => {
    const admin = createAdminMock({
      organization: {
        id: 'org-1',
        name: 'Other Hotel Client',
        phone: '08000000001',
        email: 'private@example.com',
        org_type: 'corporate',
        created_by: 'external-creator',
      },
      creatorProfile: { organization_id: 'hotel-2' },
    })

    const result = await resolveEventClientRecord(admin, baseInput)

    assert.deepEqual(result, { error: 'Organization not found' })
  })
})
