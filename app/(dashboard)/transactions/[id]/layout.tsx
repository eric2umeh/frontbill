import type { Metadata } from 'next'

export const metadata: Metadata = { title: "Transaction" }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
