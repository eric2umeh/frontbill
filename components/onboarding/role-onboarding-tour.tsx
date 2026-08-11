'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  canAccessExpenseMenu,
  canAccessSupplyPurchaseOrdersMenu,
  canonicalRoleKey,
  hasPermission,
} from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type Tip = {
  title: string
  body: string
  /** Navigate here before spotlighting */
  href?: string
  /** `data-tour` value on the sidebar (or page) target */
  target?: string
}

function storageKey(userId: string) {
  return `frontbill_onboarding_v2_${userId}`
}

function tipsForRole(role: string | null | undefined): Tip[] {
  const rk = canonicalRoleKey(role)
  const tips: Tip[] = [
    {
      title: 'Welcome to FrontBill',
      body: 'We’ll point out the menus you can use. Follow each tip — Skip anytime.',
    },
  ]

  if (hasPermission(role, 'bookings:view')) {
    tips.push({
      title: 'Bookings',
      body: 'In-house guests, due out today, and today’s arrivals — your daily front-office list.',
      href: '/bookings',
      target: 'nav-bookings',
    })
  }

  if (hasPermission(role, 'reservations:view')) {
    tips.push({
      title: 'Reservations / Events',
      body: 'Future stays and events. Check guests in from here when they arrive.',
      href: '/reservations',
      target: 'nav-reservations',
    })
  }

  if (
    hasPermission(role, 'guests:view') ||
    hasPermission(role, 'organizations:view')
  ) {
    tips.push({
      title: 'Guest / Org',
      body: 'Guest profiles, company accounts, balances, and prepaid credit.',
      href: '/accounts',
      target: 'nav-accounts',
    })
  }

  if (hasPermission(role, 'outlet:view')) {
    tips.push({
      title: 'Outlets (POS)',
      body: 'Restaurant, bars, laundry, and more — settle cash, transfer, POS, or room charge.',
      href: '/outlets',
      target: 'nav-outlets',
    })
  }

  if (hasPermission(role, 'housekeeping:view')) {
    tips.push({
      title: 'Housekeeping',
      body: 'Cleaning tasks and room-ready status tied to real stays.',
      href: '/housekeeping',
      target: 'nav-housekeeping',
    })
  }

  if (hasPermission(role, 'maintenance:view')) {
    tips.push({
      title: 'Maintenance',
      body: 'Work orders and out-of-order rooms so Front Desk does not sell a blocked room.',
      href: '/maintenance',
      target: 'nav-maintenance',
    })
  }

  if (hasPermission(role, 'supply:store')) {
    tips.push({
      title: 'Central Store',
      body: 'Stock levels, Issue Out, and raise purchase lists. Only one open PO at a time.',
      href: '/supply/store',
      target: 'nav-supply-store',
    })
  }

  if (hasPermission(role, 'supply:kitchen')) {
    tips.push({
      title: 'Kitchen',
      body: 'Kitchen stock, recipes/batches, and purchase lists that go to Central Store first.',
      href: '/supply/kitchen',
      target: 'nav-kitchen',
    })
  }

  if (canAccessSupplyPurchaseOrdersMenu(role)) {
    tips.push({
      title: 'Purchase Orders',
      body: 'Approve raised POs and review market retirements. Stock updates only after retirement is accepted.',
      href: '/supply/purchase-orders',
      target: 'nav-purchase-orders',
    })
  }

  if (hasPermission(role, 'supply:purchasing') && rk !== 'accountant') {
    tips.push({
      title: 'Purchasing',
      body: 'After disbursement, record the market buy and submit retirement for review.',
      href: '/supply/purchasing',
      target: 'nav-purchasing',
    })
  }

  if (canAccessExpenseMenu(role) && hasPermission(role, 'expenses:view')) {
    tips.push({
      title: 'Expenses',
      body: 'Record operating expenses by category. Totals feed Monthly P&L and daily expenditure reports.',
      href: '/expenses',
      target: 'nav-expenses',
    })
  }

  if (hasPermission(role, 'night_audit:view')) {
    tips.push({
      title: 'Night Audit',
      body: 'Close the business day and handle pending approvals (backdate, room change, extend).',
      href: '/night-audit',
      target: 'nav-night-audit',
    })
  }

  tips.push({
    title: 'You are set',
    body: 'Use the sidebar anytime. Open Help (?) for how-to answers on approvals and workflows.',
  })

  return tips
}

function tourTargetAttr(href: string): string | undefined {
  const map: Record<string, string> = {
    '/bookings': 'nav-bookings',
    '/reservations': 'nav-reservations',
    '/accounts': 'nav-accounts',
    '/outlets': 'nav-outlets',
    '/housekeeping': 'nav-housekeeping',
    '/maintenance': 'nav-maintenance',
    '/supply/store': 'nav-supply-store',
    '/supply/kitchen': 'nav-kitchen',
    '/supply/purchase-orders': 'nav-purchase-orders',
    '/supply/purchasing': 'nav-purchasing',
    '/expenses': 'nav-expenses',
    '/night-audit': 'nav-night-audit',
    '/dashboard': 'nav-dashboard',
    '/reports': 'nav-reports',
    '/transactions/daily-book': 'nav-transactions',
  }
  return map[href]
}

type Rect = { top: number; left: number; width: number; height: number }

export function RoleOnboardingTour() {
  const { userId, role, name } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const tips = useMemo(() => tipsForRole(role), [role])
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)

  const tip = tips[step]

  const clearElevatedTarget = useCallback(() => {
    document.querySelectorAll<HTMLElement>('[data-tour-elevated]').forEach((el) => {
      el.style.zIndex = ''
      el.style.position = ''
      el.style.backgroundColor = ''
      el.style.boxShadow = ''
      el.style.borderRadius = ''
      el.removeAttribute('data-tour-elevated')
    })
  }, [])

  const finish = useCallback(() => {
    if (userId) {
      try {
        localStorage.setItem(storageKey(userId), 'done')
      } catch {
        /* ignore */
      }
    }
    clearElevatedTarget()
    setOpen(false)
    setRect(null)
  }, [userId, clearElevatedTarget])

  useEffect(() => {
    if (!userId) return
    try {
      if (localStorage.getItem(storageKey(userId)) === 'done') return
      setOpen(true)
      setStep(0)
    } catch {
      /* ignore */
    }
  }, [userId])

  const measureTarget = useCallback(
    (target?: string) => {
      clearElevatedTarget()
      if (!target) {
        setRect(null)
        setReady(true)
        return
      }
      const el = document.querySelector(
        `[data-tour="${target}"]`,
      ) as HTMLElement | null
      if (!el) {
        setRect(null)
        setReady(true)
        return
      }
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      // Lift the real nav label above the dim overlay so it stays sharp and readable.
      const computed = window.getComputedStyle(el)
      if (computed.position === 'static') el.style.position = 'relative'
      el.style.zIndex = '210'
      el.style.backgroundColor =
        computed.backgroundColor === 'rgba(0, 0, 0, 0)' ||
        computed.backgroundColor === 'transparent'
          ? 'hsl(var(--background))'
          : computed.backgroundColor
      el.style.boxShadow = '0 0 0 6px hsl(var(--background))'
      el.style.borderRadius = '0.5rem'
      el.setAttribute('data-tour-elevated', '1')

      const r = el.getBoundingClientRect()
      const pad = 8
      setRect({
        top: Math.max(8, r.top - pad),
        left: Math.max(8, r.left - pad),
        width: Math.min(window.innerWidth - 16, r.width + pad * 2),
        height: r.height + pad * 2,
      })
      setReady(true)
    },
    [clearElevatedTarget],
  )

  useEffect(() => {
    if (!open || !tip) return
    let cancelled = false
    setReady(false)

    const run = async () => {
      if (tip.href) {
        window.dispatchEvent(
          new CustomEvent('frontbill:tour-open-nav', {
            detail: { href: tip.href },
          }),
        )
      }
      if (tip.href && pathname !== tip.href && !pathname.startsWith(`${tip.href}/`)) {
        router.push(tip.href)
        // Wait for navigation + paint
        await new Promise((r) => setTimeout(r, 500))
      } else {
        await new Promise((r) => setTimeout(r, 120))
      }
      if (cancelled) return
      // Retry measure — dropdown may still be opening
      measureTarget(tip.target)
      await new Promise((r) => setTimeout(r, 200))
      if (!cancelled) measureTarget(tip.target)
    }

    void run()

    const onResize = () => {
      if (tip.target) measureTarget(tip.target)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      clearElevatedTarget()
    }
  }, [open, tip, pathname, router, measureTarget, step, clearElevatedTarget])

  if (!open || !tip) return null

  const progress = tips.length ? ((step + 1) / tips.length) * 100 : 100
  const cardTop = rect
    ? Math.min(window.innerHeight - 220, rect.top + rect.height + 12)
    : Math.max(80, window.innerHeight / 2 - 100)
  const cardLeft = rect
    ? Math.min(window.innerWidth - 360, Math.max(16, rect.left))
    : Math.max(16, window.innerWidth / 2 - 170)

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true">
      {/* Dim only — no backdrop-blur (blur was washing out the spotlighted nav label). */}
      {!rect && <div className="absolute inset-0 bg-black/50" />}

      {/* Spotlight cutout via box-shadow; hole stays sharp over elevated target */}
      {rect && (
        <div
          className="pointer-events-none absolute z-[201] rounded-xl border-2 border-primary bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      {/* Tip card */}
      <div
        className={cn(
          'absolute z-[202] w-[min(21.5rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)]',
          !ready && 'opacity-0 translate-y-1',
          ready && 'opacity-100 translate-y-0 transition-all duration-300 ease-out',
        )}
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary via-sky-500 to-violet-500" />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Quick tour
              </p>
              <p className="text-[17px] font-semibold leading-tight tracking-tight">
                {step === 0 && name ? `Hi ${name.split(' ')[0]}` : tip.title}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold tabular-nums text-foreground">
              {step + 1}/{tips.length}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {tip.body}
          </p>
          <Progress value={progress} className="h-1.5 bg-muted" />
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={finish}
            >
              Skip
            </Button>
            <div className="flex items-center gap-1.5">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full px-3.5"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Back
                </Button>
              )}
              {step < tips.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-4 shadow-sm"
                  onClick={() => setStep((s) => s + 1)}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-4 shadow-sm"
                  onClick={finish}
                >
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Attach to sidebar links for spotlight targeting. */
export { tourTargetAttr }
