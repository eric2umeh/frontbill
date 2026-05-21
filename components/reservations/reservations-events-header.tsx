'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ReservationsEventsHeaderContextValue = {
  headerActions: ReactNode
  setHeaderActions: (actions: ReactNode) => void
}

const ReservationsEventsHeaderContext =
  createContext<ReservationsEventsHeaderContextValue | null>(null)

export function ReservationsEventsHeaderProvider({ children }: { children: ReactNode }) {
  const [headerActions, setHeaderActionsState] = useState<ReactNode>(null)
  const setHeaderActions = useCallback((actions: ReactNode) => {
    setHeaderActionsState(actions)
  }, [])

  const value = useMemo(
    () => ({ headerActions, setHeaderActions }),
    [headerActions, setHeaderActions],
  )

  return (
    <ReservationsEventsHeaderContext.Provider value={value}>
      {children}
    </ReservationsEventsHeaderContext.Provider>
  )
}

export function useReservationsEventsHeader() {
  const ctx = useContext(ReservationsEventsHeaderContext)
  if (!ctx) {
    throw new Error('useReservationsEventsHeader must be used within ReservationsEventsHeaderProvider')
  }
  return ctx
}
