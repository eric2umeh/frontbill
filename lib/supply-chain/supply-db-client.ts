'use client'

import type { StoreItem } from './types'
import type { SupplySnapshotKey } from './supply-db-mappers'
import { isRetryableSupplyError, withFetchRetry } from '@/lib/utils/fetch-retry'

async function authHeaders(forceRefresh = false): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {}
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    if (!supabase) return {}
    let {
      data: { session },
    } = await supabase.auth.getSession()
    const expiresSoon =
      !!session?.expires_at && session.expires_at * 1000 < Date.now() + 15_000
    if (forceRefresh || !session?.access_token || expiresSoon) {
      const refreshed = await supabase.auth.refreshSession()
      session = refreshed.data.session
    }
    if (!session?.access_token) return {}
    return { Authorization: `Bearer ${session.access_token}` }
  } catch {
    return {}
  }
}

function errorFromBody(body: unknown, fallback: string): Error {
  const msg =
    typeof body === 'object' &&
    body != null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
      ? (body as { error: string }).error
      : fallback
  return new Error(msg)
}

async function parseJson(res: Response) {
  if (res.status === 499) {
    throw new Error('terminated')
  }
  const text = await res.text()
  let body: unknown = {}
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      if (!res.ok) {
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          throw new Error(`Server temporarily unavailable (${res.status})`)
        }
        throw new Error(res.statusText || `Request failed (${res.status})`)
      }
    }
  }
  if (!res.ok) {
    throw errorFromBody(
      body,
      res.status === 401
        ? 'Unauthorized'
        : res.status === 502 || res.status === 503 || res.status === 504
          ? `Server temporarily unavailable (${res.status})`
          : `Request failed (${res.status})`,
    )
  }
  return body
}

const fetchOpts: RequestInit = { credentials: 'same-origin' }

function queryParams(userId: string, organizationId?: string) {
  const params = new URLSearchParams({ caller_id: userId })
  if (organizationId) params.set('organization_id', organizationId)
  return params
}

function authBody(userId: string, organizationId: string | undefined, extra: Record<string, unknown>) {
  return {
    caller_id: userId,
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...extra,
  }
}

async function supplyRequest(url: string, init: RequestInit): Promise<Response> {
  const headers = await authHeaders()
  let res = await fetch(url, {
    ...fetchOpts,
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  })
  if (res.status === 401) {
    const retryHeaders = await authHeaders(true)
    res = await fetch(url, {
      ...fetchOpts,
      ...init,
      headers: { ...retryHeaders, ...(init.headers as Record<string, string> | undefined) },
    })
  }
  return res
}

async function supplyJson(url: string, init: RequestInit = {}): Promise<ReturnType<typeof parseJson>> {
  return withFetchRetry(
    async () => parseJson(await supplyRequest(url, init)),
    { retries: 2, baseDelayMs: 400, retryIf: isRetryableSupplyError },
  )
}

export async function fetchSupplyCatalog(
  userId: string,
  organizationId?: string,
): Promise<StoreItem[]> {
  const body = await supplyJson(`/api/supply/catalog?${queryParams(userId, organizationId)}`)
  return (body.items ?? []) as StoreItem[]
}

export async function insertSupplyCatalogItem(
  userId: string,
  item: StoreItem,
  organizationId?: string,
): Promise<StoreItem> {
  const body = await supplyJson('/api/supply/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody(userId, organizationId, { item })),
  })
  return body.item as StoreItem
}

export async function updateSupplyCatalogItem(
  userId: string,
  itemId: string,
  patch: Partial<StoreItem>,
  organizationId?: string,
): Promise<void> {
  await supplyJson(`/api/supply/catalog/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody(userId, organizationId, { patch })),
  })
}

export async function deleteSupplyCatalogItem(
  userId: string,
  itemId: string,
  organizationId?: string,
): Promise<void> {
  await supplyJson(`/api/supply/catalog/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody(userId, organizationId, {})),
  })
}

export async function fetchSupplySnapshots(
  userId: string,
  organizationId?: string,
  keys?: readonly SupplySnapshotKey[],
): Promise<Partial<Record<SupplySnapshotKey, unknown>>> {
  const params = queryParams(userId, organizationId)
  if (keys && keys.length > 0) params.set('keys', keys.join(','))
  const body = await supplyJson(`/api/supply/state?${params}`)
  return (body.snapshots ?? {}) as Partial<Record<SupplySnapshotKey, unknown>>
}

export async function saveSupplySnapshots(
  userId: string,
  snapshots: Partial<Record<SupplySnapshotKey, unknown>>,
  organizationId?: string,
): Promise<void> {
  await withFetchRetry(
    async () =>
      parseJson(
        await supplyRequest('/api/supply/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(authBody(userId, organizationId, { snapshots })),
        }),
      ),
    { retries: 4, baseDelayMs: 800, retryIf: isRetryableSupplyError },
  )
}

export async function syncSupplyCatalog(
  userId: string,
  items: StoreItem[],
  organizationId?: string,
): Promise<void> {
  await supplyJson('/api/supply/catalog/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authBody(userId, organizationId, { items })),
  })
}
