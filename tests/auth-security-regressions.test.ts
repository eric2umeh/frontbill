import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ensureHotelOwnerProfile } from '@/lib/auth/ensure-hotel-owner-profile'
import {
  isPublicSignupEnabled,
  isPublicSignupEnabledClient,
} from '@/lib/auth/public-signup'
import { resolveDashboardUserPayload } from '@/lib/auth/load-dashboard-user'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('dashboard auth resolution', () => {
  it('does not grant admin access when the profile is missing', () => {
    const user = resolveDashboardUserPayload({
      userId: 'user-1',
      email: 'owner@example.com',
      profile: null,
      metadataRole: 'admin',
    })

    assert.equal(user, null)
  })

  it('does not allow dashboard access without an organization id', () => {
    const user = resolveDashboardUserPayload({
      userId: 'user-1',
      email: 'owner@example.com',
      profile: {
        full_name: 'Owner',
        role: 'admin',
        organization_id: null,
      },
      metadataRole: null,
    })

    assert.equal(user, null)
  })

  it('returns a user only for a loaded profile with an organization and allowed role', () => {
    const user = resolveDashboardUserPayload({
      userId: 'user-1',
      email: 'manager@example.com',
      profile: {
        full_name: 'Manager User',
        role: 'manager',
        organization_id: 'org-1',
      },
      metadataRole: null,
    })

    assert.deepEqual(user, {
      id: 'user-1',
      email: 'manager@example.com',
      name: 'Manager User',
      role: 'manager',
      organizationId: 'org-1',
      organizationLogoUrl: '',
    })
  })
})

describe('hotel owner signup', () => {
  it('creates a fresh organization instead of reusing an organization by email', async () => {
    const calls = {
      organizationInserts: [] as unknown[],
      organizationSelects: 0,
      profileUpserts: [] as unknown[],
    }

    const admin = {
      from(table: string) {
        if (table === 'profiles') {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: null, error: null }
                    },
                  }
                },
              }
            },
            async upsert(row: unknown) {
              calls.profileUpserts.push(row)
              return { error: null }
            },
          }
        }

        if (table === 'organizations') {
          return {
            select() {
              calls.organizationSelects += 1
              throw new Error('organization lookup by email must not run')
            },
            insert(row: unknown) {
              calls.organizationInserts.push(row)
              return {
                select() {
                  return {
                    async single() {
                      return { data: { id: 'new-org-id' }, error: null }
                    },
                  }
                },
              }
            },
          }
        }

        throw new Error(`unexpected table: ${table}`)
      },
    }

    const result = await ensureHotelOwnerProfile(admin as never, {
      userId: 'new-user-id',
      email: 'shared-hotel-email@example.com',
      fullName: 'New Owner',
      hotelName: 'New Hotel',
    })

    assert.deepEqual(result, { organizationId: 'new-org-id' })
    assert.equal(calls.organizationSelects, 0)
    assert.deepEqual(calls.organizationInserts, [
      { name: 'New Hotel', email: 'shared-hotel-email@example.com' },
    ])
    assert.deepEqual(calls.profileUpserts, [
      {
        id: 'new-user-id',
        organization_id: 'new-org-id',
        full_name: 'New Owner',
        role: 'admin',
      },
    ])
  })
})

describe('public signup exposure', () => {
  it('does not enable signup on production from SUPABASE_ENV=staging alone', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP
    process.env.SUPABASE_ENV = 'staging'
    process.env.NEXT_PUBLIC_SUPABASE_ENV = 'staging'
    process.env.VERCEL_ENV = 'production'

    assert.equal(isPublicSignupEnabled(), false)
    assert.equal(isPublicSignupEnabledClient(), false)
  })

  it('allows staging env defaults outside production', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP
    process.env.SUPABASE_ENV = 'staging'
    process.env.NEXT_PUBLIC_SUPABASE_ENV = 'staging'
    process.env.VERCEL_ENV = 'preview'

    assert.equal(isPublicSignupEnabled(), true)
    assert.equal(isPublicSignupEnabledClient(), false)
  })

  it('allows explicit signup flags', () => {
    process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SIGNUP = 'true'
    process.env.SUPABASE_ENV = 'production'
    process.env.NEXT_PUBLIC_SUPABASE_ENV = 'production'
    process.env.VERCEL_ENV = 'production'

    assert.equal(isPublicSignupEnabled(), true)
    assert.equal(isPublicSignupEnabledClient(), true)
  })
})
