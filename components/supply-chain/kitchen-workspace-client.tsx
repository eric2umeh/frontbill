'use client'

import dynamic from 'next/dynamic'

const KitchenWorkspace = dynamic(
  () =>
    import('@/components/supply-chain/kitchen-workspace').then((m) => ({
      default: m.KitchenWorkspace,
    })),
  {
    ssr: false,
    loading: () => <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />,
  },
)

export function KitchenWorkspaceClient() {
  return <KitchenWorkspace />
}
