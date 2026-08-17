import type { Metadata } from 'next'
import { StoreSectionLayout } from '@/components/store/store-section-layout'

export const metadata: Metadata = { title: 'Store' }

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return <StoreSectionLayout>{children}</StoreSectionLayout>
}
