import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Reservation' }

export default function ReservationDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
