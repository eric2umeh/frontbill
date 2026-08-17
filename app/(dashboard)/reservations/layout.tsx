import type { Metadata } from 'next'
import { ReservationsSectionLayout } from '@/components/reservations/reservations-section-layout'

export const metadata: Metadata = { title: 'Reservations' }

export default function ReservationsLayout({ children }: { children: React.ReactNode }) {
  return <ReservationsSectionLayout>{children}</ReservationsSectionLayout>
}
