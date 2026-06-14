'use client'

import { useContext } from 'react'
import { SupplyChainContext } from '@/lib/supply-chain/supply-chain-context'

/** Supply chain state when dashboard provider is mounted; null otherwise. */
export function useOptionalSupplyChain() {
  return useContext(SupplyChainContext)
}
