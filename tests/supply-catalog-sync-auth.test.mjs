import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync('app/api/supply/catalog/sync/route.ts', 'utf8')

test('catalog sync route enforces supply store permission before admin writes', () => {
  assert.match(
    source,
    /import\s+\{\s*requireSupplyPermission,\s*resolveSupplyAuthedUser,\s*\}\s+from ['"]@\/lib\/supply-chain\/supply-api-auth['"]/s,
    'sync route must import the shared permission guard',
  )

  const authIndex = source.indexOf('const auth = await resolveSupplyAuthedUser')
  const guardIndex = source.indexOf("requireSupplyPermission(auth, 'supply:store')")
  const adminIndex = source.indexOf('const admin = createAdminClient()')

  assert.notEqual(authIndex, -1, 'sync route must resolve the authenticated caller')
  assert.notEqual(guardIndex, -1, 'sync route must require supply:store access')
  assert.notEqual(adminIndex, -1, 'sync route must still use the admin client after authorization')
  assert.ok(
    authIndex < guardIndex && guardIndex < adminIndex,
    'permission guard must run after authentication and before admin-client writes',
  )
})
