import type { Metadata } from 'next'

export const metadata: Metadata = { title: "Guest database" }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
