import type { Metadata } from 'next'

export const metadata: Metadata = { title: "F&B Store" }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
