'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PaymentAccount } from '@/lib/payments/payment-accounts'
import { accountAppliesToMethod } from '@/lib/payments/payment-accounts'

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  if (!supabase) return {}
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

export function usePaymentAccounts(options?: {
  method?: string | null
  includeInactive?: boolean
  enabled?: boolean
}) {
  const method = options?.method
  const includeInactive = Boolean(options?.includeInactive)
  const enabled = options?.enabled !== false
  const [accounts, setAccounts] = useState<PaymentAccount[]>([])
  const [dbAvailable, setDbAvailable] = useState(true)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!enabled) {
      setAccounts([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (includeInactive) qs.set('include_inactive', '1')
      if (method) qs.set('method', method)
      const headers = await authHeaders()
      const res = await fetch(`/api/payment-accounts?${qs}`, {
        credentials: 'include',
        headers,
      })
      const json = await res.json()
      if (!res.ok) {
        setAccounts([])
        return
      }
      setDbAvailable(json.dbAvailable !== false)
      let list = (json.accounts || []) as PaymentAccount[]
      if (method) {
        list = list.filter((a) => accountAppliesToMethod(a, method))
      }
      setAccounts(list)
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [enabled, includeInactive, method])

  useEffect(() => {
    void reload()
  }, [reload])

  return { accounts, loading, dbAvailable, reload }
}

export async function createPaymentAccount(body: {
  bank_name: string
  account_number: string
  account_name: string
  kind?: string
}): Promise<{ account?: PaymentAccount; error?: string }> {
  const headers = await authHeaders()
  const res = await fetch('/api/payment-accounts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) return { error: json.error || 'Failed to create' }
  return { account: json.account }
}

export async function updatePaymentAccount(
  id: string,
  body: Record<string, unknown>,
): Promise<{ account?: PaymentAccount; error?: string }> {
  const headers = await authHeaders()
  const res = await fetch(`/api/payment-accounts/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) return { error: json.error || 'Failed to update' }
  return { account: json.account }
}

export async function deletePaymentAccount(id: string): Promise<{ error?: string }> {
  const headers = await authHeaders()
  const res = await fetch(`/api/payment-accounts/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { error: json.error || 'Failed to delete' }
  return {}
}
