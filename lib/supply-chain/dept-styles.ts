import type { SupplyDept } from '@/lib/supply-chain/types'

/** Distinct header colors per department for PO / basket section cards. */
export const DEPT_HEADER_STYLES: Record<
  Exclude<SupplyDept, 'all'>,
  { header: string; badge: string; accent: string }
> = {
  kitchen: {
    header: 'bg-orange-100/90 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800',
    badge: 'bg-orange-200 text-orange-950 border-orange-300 dark:bg-orange-900 dark:text-orange-50',
    accent: 'text-orange-800 dark:text-orange-200',
  },
  main_bar: {
    header: 'bg-violet-100/90 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800',
    badge: 'bg-violet-200 text-violet-950 border-violet-300 dark:bg-violet-900 dark:text-violet-50',
    accent: 'text-violet-800 dark:text-violet-200',
  },
  restaurant: {
    header: 'bg-rose-100/90 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800',
    badge: 'bg-rose-200 text-rose-950 border-rose-300 dark:bg-rose-900 dark:text-rose-50',
    accent: 'text-rose-800 dark:text-rose-200',
  },
  pastry: {
    header: 'bg-pink-100/90 border-pink-200 dark:bg-pink-950/40 dark:border-pink-800',
    badge: 'bg-pink-200 text-pink-950 border-pink-300 dark:bg-pink-900 dark:text-pink-50',
    accent: 'text-pink-800 dark:text-pink-200',
  },
  frozen: {
    header: 'bg-sky-100/90 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800',
    badge: 'bg-sky-200 text-sky-950 border-sky-300 dark:bg-sky-900 dark:text-sky-50',
    accent: 'text-sky-800 dark:text-sky-200',
  },
  beverage: {
    header: 'bg-cyan-100/90 border-cyan-200 dark:bg-cyan-950/40 dark:border-cyan-800',
    badge: 'bg-cyan-200 text-cyan-950 border-cyan-300 dark:bg-cyan-900 dark:text-cyan-50',
    accent: 'text-cyan-800 dark:text-cyan-200',
  },
  housekeeping: {
    header: 'bg-teal-100/90 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800',
    badge: 'bg-teal-200 text-teal-950 border-teal-300 dark:bg-teal-900 dark:text-teal-50',
    accent: 'text-teal-800 dark:text-teal-200',
  },
  laundry: {
    header: 'bg-emerald-100/90 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
    badge: 'bg-emerald-200 text-emerald-950 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-50',
    accent: 'text-emerald-800 dark:text-emerald-200',
  },
  maintenance: {
    header: 'bg-amber-100/90 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
    badge: 'bg-amber-200 text-amber-950 border-amber-300 dark:bg-amber-900 dark:text-amber-50',
    accent: 'text-amber-800 dark:text-amber-200',
  },
  front_office: {
    header: 'bg-indigo-100/90 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-800',
    badge: 'bg-indigo-200 text-indigo-950 border-indigo-300 dark:bg-indigo-900 dark:text-indigo-50',
    accent: 'text-indigo-800 dark:text-indigo-200',
  },
  administration: {
    header: 'bg-slate-200/90 border-slate-300 dark:bg-slate-800/60 dark:border-slate-600',
    badge: 'bg-slate-300 text-slate-950 border-slate-400 dark:bg-slate-700 dark:text-slate-50',
    accent: 'text-slate-800 dark:text-slate-200',
  },
  account: {
    header: 'bg-lime-100/90 border-lime-200 dark:bg-lime-950/40 dark:border-lime-800',
    badge: 'bg-lime-200 text-lime-950 border-lime-300 dark:bg-lime-900 dark:text-lime-50',
    accent: 'text-lime-800 dark:text-lime-200',
  },
  general_store: {
    header: 'bg-stone-200/90 border-stone-300 dark:bg-stone-800/60 dark:border-stone-600',
    badge: 'bg-stone-300 text-stone-950 border-stone-400 dark:bg-stone-700 dark:text-stone-50',
    accent: 'text-stone-800 dark:text-stone-200',
  },
}

export function deptHeaderStyle(dept: string) {
  const key = dept as Exclude<SupplyDept, 'all'>
  return (
    DEPT_HEADER_STYLES[key] ?? {
      header: 'bg-muted/40 border-border',
      badge: '',
      accent: 'text-muted-foreground',
    }
  )
}
