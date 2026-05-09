'use client'

import { createContext, useContext } from 'react'

export const BackdatePendingCountContext = createContext<number>(0)

/** Must be used under {@link BackdatePendingProvider} in the dashboard layout. */
export function useBackdatePendingCount(): number {
  return useContext(BackdatePendingCountContext)
}
