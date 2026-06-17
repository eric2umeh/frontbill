'use client'

import type { StoreItem } from './types'
import type { SupplySnapshotKey } from './supply-db-mappers'

async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {}
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    if (!supabase) return {}
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return {}
    return { Authorization: `Bearer ${session.access_token}` }
  } catch {
    return {}
  }
}

async function parseJson(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Request failed')
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

export async function fetchSupplyCatalog(
  userId: string,
  organizationId?: string,
): Promise<StoreItem[]> {
  const headers = await authHeaders()
  const res = await fetch(`/api/supply/catalog?${queryParams(userId, organizationId)}`, {
    ...fetchOpts,
    headers,
  })
  const body = await parseJson(res)
  return (body.items ?? []) as StoreItem[]
}

export async function insertSupplyCatalogItem(
  userId: string,
  item: StoreItem,
  organizationId?: string,
): Promise<StoreItem> {
  const headers = await authHeaders()
  const res = await fetch('/api/supply/catalog', {
    ...fetchOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(authBody(userId, organizationId, { item })),
  })
  const body = await parseJson(res)
  return body.item as StoreItem
}

export async function updateSupplyCatalogItem(
  userId: string,
  itemId: string,
  patch: Partial<StoreItem>,
  organizationId?: string,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`/api/supply/catalog/${encodeURIComponent(itemId)}`, {
    ...fetchOpts,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(authBody(userId, organizationId, { patch })),
  })
  await parseJson(res)
}

export async function deleteSupplyCatalogItem(
  userId: string,
  itemId: string,
  organizationId?: string,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(`/api/supply/catalog/${encodeURIComponent(itemId)}`, {
    ...fetchOpts,
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(authBody(userId, organizationId, {})),
  })
  await parseJson(res)
}

export async function fetchSupplySnapshots(
  userId: string,
  organizationId?: string,
): Promise<Partial<Record<SupplySnapshotKey, unknown>>> {
  const headers = await authHeaders()
  const res = await fetch(`/api/supply/state?${queryParams(userId, organizationId)}`, {
    ...fetchOpts,
    headers,
  })
  const body = await parseJson(res)
  return (body.snapshots ?? {}) as Partial<Record<SupplySnapshotKey, unknown>>
}

export async function saveSupplySnapshots(
  userId: string,
  snapshots: Partial<Record<SupplySnapshotKey, unknown>>,
  organizationId?: string,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch('/api/supply/state', {
    ...fetchOpts,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(authBody(userId, organizationId, { snapshots })),
  })
  await parseJson(res)
}

export async function syncSupplyCatalog(
  userId: string,
  items: StoreItem[],
  organizationId?: string,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch('/api/supply/catalog/sync', {
    ...fetchOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(authBody(userId, organizationId, { items })),
  })
  await parseJson(res)
}
