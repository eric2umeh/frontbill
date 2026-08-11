import type { SupplyDept } from '@/lib/supply-chain/types'

/**
 * Distinct department colors for PO / basket sections.
 * Avoids green / amber-yellow / orange / red (status-like impressions).
 */
export const DEPT_HEADER_STYLES: Record<
  Exclude<SupplyDept, 'all'>,
  { header: string; badge: string; accent: string }
> = {
  kitchen: {
    header: 'bg-indigo-100/90 border-indigo-300 dark:bg-indigo-950/45 dark:border-indigo-700',
    badge: 'bg-indigo-200 text-indigo-950 border-indigo-400 dark:bg-indigo-900 dark:text-indigo-50',
    accent: 'text-indigo-900 dark:text-indigo-100',
  },
  main_bar: {
    header: 'bg-violet-100/90 border-violet-300 dark:bg-violet-950/45 dark:border-violet-700',
    badge: 'bg-violet-200 text-violet-950 border-violet-400 dark:bg-violet-900 dark:text-violet-50',
    accent: 'text-violet-900 dark:text-violet-100',
  },
  restaurant: {
    header: 'bg-fuchsia-100/90 border-fuchsia-300 dark:bg-fuchsia-950/45 dark:border-fuchsia-700',
    badge: 'bg-fuchsia-200 text-fuchsia-950 border-fuchsia-400 dark:bg-fuchsia-900 dark:text-fuchsia-50',
    accent: 'text-fuchsia-900 dark:text-fuchsia-100',
  },
  pastry: {
    header: 'bg-purple-100/90 border-purple-300 dark:bg-purple-950/45 dark:border-purple-700',
    badge: 'bg-purple-200 text-purple-950 border-purple-400 dark:bg-purple-900 dark:text-purple-50',
    accent: 'text-purple-900 dark:text-purple-100',
  },
  frozen: {
    header: 'bg-sky-100/90 border-sky-300 dark:bg-sky-950/45 dark:border-sky-700',
    badge: 'bg-sky-200 text-sky-950 border-sky-400 dark:bg-sky-900 dark:text-sky-50',
    accent: 'text-sky-900 dark:text-sky-100',
  },
  beverage: {
    header: 'bg-cyan-100/90 border-cyan-300 dark:bg-cyan-950/45 dark:border-cyan-700',
    badge: 'bg-cyan-200 text-cyan-950 border-cyan-400 dark:bg-cyan-900 dark:text-cyan-50',
    accent: 'text-cyan-900 dark:text-cyan-100',
  },
  housekeeping: {
    header: 'bg-teal-100/90 border-teal-300 dark:bg-teal-950/45 dark:border-teal-700',
    badge: 'bg-teal-200 text-teal-950 border-teal-400 dark:bg-teal-900 dark:text-teal-50',
    accent: 'text-teal-900 dark:text-teal-100',
  },
  laundry: {
    header: 'bg-blue-100/90 border-blue-300 dark:bg-blue-950/45 dark:border-blue-700',
    badge: 'bg-blue-200 text-blue-950 border-blue-400 dark:bg-blue-900 dark:text-blue-50',
    accent: 'text-blue-900 dark:text-blue-100',
  },
  maintenance: {
    header: 'bg-stone-200/90 border-stone-400 dark:bg-stone-800/70 dark:border-stone-600',
    badge: 'bg-stone-300 text-stone-950 border-stone-500 dark:bg-stone-700 dark:text-stone-50',
    accent: 'text-stone-900 dark:text-stone-100',
  },
  front_office: {
    header: 'bg-slate-200/90 border-slate-400 dark:bg-slate-800/70 dark:border-slate-600',
    badge: 'bg-slate-300 text-slate-950 border-slate-500 dark:bg-slate-700 dark:text-slate-50',
    accent: 'text-slate-900 dark:text-slate-100',
  },
  administration: {
    header: 'bg-zinc-200/90 border-zinc-400 dark:bg-zinc-800/70 dark:border-zinc-600',
    badge: 'bg-zinc-300 text-zinc-950 border-zinc-500 dark:bg-zinc-700 dark:text-zinc-50',
    accent: 'text-zinc-900 dark:text-zinc-100',
  },
  account: {
    header: 'bg-neutral-200/90 border-neutral-400 dark:bg-neutral-800/70 dark:border-neutral-600',
    badge: 'bg-neutral-300 text-neutral-950 border-neutral-500 dark:bg-neutral-700 dark:text-neutral-50',
    accent: 'text-neutral-900 dark:text-neutral-100',
  },
  general_store: {
    header: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-950 border-blue-300 dark:bg-blue-900 dark:text-blue-50',
    accent: 'text-blue-900 dark:text-blue-100',
  },
}

const FALLBACK = {
  header: 'bg-muted/40 border-border',
  badge: 'bg-muted text-foreground border-border',
  accent: 'text-muted-foreground',
}

export function deptHeaderStyle(dept: string) {
  const key = dept as Exclude<SupplyDept, 'all'>
  return DEPT_HEADER_STYLES[key] ?? FALLBACK
}
