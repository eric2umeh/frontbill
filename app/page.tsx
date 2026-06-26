import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  Globe2,
  Hotel,
  LockKeyhole,
  Mail,
  Phone,
  ReceiptText,
  Sparkles,
  Store,
  Utensils,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const contactEmail = 'frontbill.tech@gmail.com'
const contactPhone = '+2348180329799'

export const metadata: Metadata = {
  title: 'FrontBill | Hotel Management Software, PMS, POS, Night Audit & Store Control',
  description:
    'FrontBill is a modern hotel management platform for bookings, reservations, rooms, payments, night audit, store control, kitchen production, outlets, reports, and custom hotel websites.',
  keywords: [
    'hotel management software Nigeria',
    'hotel PMS Nigeria',
    'hotel booking software',
    'hotel POS software',
    'night audit software',
    'hotel inventory management',
    'hotel website booking engine',
    'FrontBill',
  ],
  openGraph: {
    title: 'FrontBill | Modern Hotel Management Software',
    description:
      'Run hotel operations, bookings, payments, night audit, store, kitchen, outlets, and direct booking websites from one platform.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FrontBill | Modern Hotel Management Software',
    description:
      'Hotel PMS, reservations, POS, night audit, inventory, kitchen production, reports, and direct booking websites.',
  },
}

export default function Home() {
  const modules = [
    {
      icon: BedDouble,
      title: 'Rooms, bookings, and reservations',
      text: 'Run walk-ins, future reservations, room moves, extensions, folios, payments, and housekeeping from one clean dashboard.',
    },
    {
      icon: ReceiptText,
      title: 'Night audit and approvals',
      text: 'Control backdates, room changes, discounted extensions, audit trails, and end-of-day operations with role-based approvals.',
    },
    {
      icon: Store,
      title: 'Store and supply chain',
      text: 'Manage purchasing, issue-outs, kitchen raw stock, production batches, F&B stock, price history, and accountable unit conversions.',
    },
    {
      icon: Utensils,
      title: 'Restaurant and outlet control',
      text: 'Track produced food, outlet stock, POS sales, complimentary orders, stock deduction, and daily outlet reporting.',
    },
    {
      icon: BarChart3,
      title: 'Revenue and profitability',
      text: 'See revenue, expenses, profitability, payment breakdowns, guest history, and operational trends without spreadsheet work.',
    },
    {
      icon: LockKeyhole,
      title: 'Roles and accountability',
      text: 'Give owners, managers, front desk, store, kitchen, accountant, and auditors the right access for their responsibility.',
    },
  ]

  const websiteFlow = [
    'Guest visits the hotel website',
    'Selects room, hall, event, or bulk booking dates',
    'Availability checks against FrontBill',
    'Booking appears in the dashboard instantly',
  ]

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <section className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.35),_transparent_32%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.18),_transparent_26%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent" />

        <header className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg shadow-blue-500/20">
              <Hotel className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">FrontBill</p>
              <p className="text-[11px] uppercase tracking-[0.28em] text-blue-200">Hotel OS</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#website" className="hover:text-white">Hotel websites</a>
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex" asChild>
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button className="rounded-full bg-white text-slate-950 hover:bg-blue-50" asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </header>

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-16">
          <div>
            <Badge className="mb-5 rounded-full border-white/10 bg-white/10 px-4 py-1 text-blue-100 hover:bg-white/10">
              Built for hotels that want control, speed, and online growth
            </Badge>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
              Run your hotel like a modern revenue machine.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              FrontBill combines hotel operations, reservations, night audit, payments, store control, kitchen production,
              outlets, and reporting in one dashboard built for real hotel workflows.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full bg-blue-500 px-7 text-white hover:bg-blue-400" asChild>
                <Link href="/auth/login">
                  Start with the dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full border-white/20 bg-white/5 px-7 text-white hover:bg-white/10 hover:text-white" asChild>
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-3 text-sm text-slate-300">
              {['Cloud hosted', 'Role based', 'Mobile ready'].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-blue-500/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-white/10 p-3 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="rounded-[1.5rem] bg-slate-950 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">Today at FrontBill Grand</p>
                    <p className="text-2xl font-bold">Live operations</p>
                  </div>
                  <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Online</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Occupancy', '82%', '24 rooms active'],
                    ['Revenue', '₦4.8m', 'Today'],
                    ['Kitchen stock', '156', 'Portions ready'],
                    ['Night audit', '4', 'Pending approvals'],
                  ].map(([label, value, sub]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-2 text-3xl font-black">{value}</p>
                      <p className="mt-1 text-xs text-slate-500">{sub}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-emerald-500/10 p-4">
                  <p className="text-sm font-semibold">Next arrival</p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-900/80 p-3">
                    <div>
                      <p className="font-semibold">Corporate bulk reservation</p>
                      <p className="text-xs text-slate-400">12 rooms, 3 nights, city ledger</p>
                    </div>
                    <CalendarCheck className="h-8 w-8 text-blue-300" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-slate-50 px-4 py-20 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-4 rounded-full">Everything connected</Badge>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">A full hotel management platform, not just a booking form.</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Every module feeds the next: bookings update folios, payments update reports, store issue-outs feed kitchen production,
              and outlet sales deduct stock.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <Card key={module.title} className="group overflow-hidden border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                <CardContent className="p-6">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white">
                    <module.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold">{module.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{module.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="website" className="bg-white px-4 py-20 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
          <div>
            <Badge className="mb-4 rounded-full bg-slate-950 text-white hover:bg-slate-950">
              Coming next: custom hotel websites
            </Badge>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
              Give every hotel a website that books directly into FrontBill.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              FrontBill can become more than a dashboard. Hotels can get a beautiful, SEO-ready website with rooms,
              halls, events, galleries, offers, and booking flows that sync availability back into operations.
            </p>
            <div className="mt-8 grid gap-3">
              {websiteFlow.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl border bg-slate-50 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <p className="font-medium">{step}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border bg-slate-950 p-4 text-white shadow-2xl">
            <div className="overflow-hidden rounded-[1.5rem] bg-white text-slate-950">
              <div className="relative min-h-[420px] bg-[linear-gradient(180deg,_rgba(15,23,42,0.10),_rgba(15,23,42,0.72)),linear-gradient(135deg,_#dbeafe,_#fef3c7)] p-6">
                <div className="flex items-center justify-between">
                  <p className="font-black">Azure Palm Hotel</p>
                  <Button size="sm" className="rounded-full">Book now</Button>
                </div>
                <div className="mt-20 max-w-sm">
                  <Badge className="mb-4 bg-white text-slate-950 hover:bg-white">Lekki, Lagos</Badge>
                  <h3 className="text-4xl font-black tracking-tight text-white drop-shadow">Stay where business meets calm.</h3>
                  <p className="mt-3 text-sm leading-6 text-white/90">
                    Rooms, halls, restaurant, spa, and direct online booking powered by FrontBill.
                  </p>
                </div>
                <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white p-3 shadow-xl">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {['Check-in', 'Check-out', 'Guests', 'Rooms'].map((label) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] text-slate-500">{label}</p>
                        <p className="text-sm font-bold">Select</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <Globe2 className="h-4 w-4 text-emerald-300" />
              Website bookings can reserve rooms, halls, and date ranges in FrontBill automatically.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-[2rem] border border-white/10 bg-white/10 p-8 backdrop-blur md:flex-row md:items-center">
          <div>
            <Badge className="mb-4 bg-blue-500 text-white hover:bg-blue-500">
              Ready for hotel operators
            </Badge>
            <h2 className="text-3xl font-black">Start with the dashboard. Grow into the website.</h2>
            <p className="mt-3 max-w-2xl text-slate-300">
              Use FrontBill to control operations today, then add a branded hotel website when you are ready to grow direct bookings and SEO.
            </p>
            <div className="mt-5 flex flex-col gap-2 text-sm text-slate-200 sm:flex-row sm:gap-5">
              <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 hover:text-white">
                <Mail className="h-4 w-4 text-blue-300" />
                {contactEmail}
              </a>
              <a href={`tel:${contactPhone}`} className="flex items-center gap-2 hover:text-white">
                <Phone className="h-4 w-4 text-emerald-300" />
                {contactPhone}
              </a>
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button className="rounded-full bg-white text-slate-950 hover:bg-blue-50" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
            <Button variant="outline" className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
              <Link href="/pricing">Compare plans</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-[2rem] border bg-slate-50 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Badge variant="secondary" className="mb-4 rounded-full">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Enquiries and demos
            </Badge>
            <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
              Want FrontBill for your hotel?
            </h2>
            <p className="mt-3 max-w-3xl text-slate-600">
              Send us your hotel name, room count, outlets, and the features you need. We will recommend the best plan,
              explain onboarding, and discuss a custom booking website if you want direct online reservations.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button className="rounded-full bg-slate-950 text-white hover:bg-slate-800" asChild>
              <a href={`mailto:${contactEmail}?subject=FrontBill%20enquiry`}>
                Email FrontBill
              </a>
            </Button>
            <Button variant="outline" className="rounded-full" asChild>
              <a href={`tel:${contactPhone}`}>Call sales</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t bg-slate-950 px-4 py-8 text-sm text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} FrontBill. Hotel management software and booking technology.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            <a href={`mailto:${contactEmail}`} className="hover:text-white">{contactEmail}</a>
            <a href={`tel:${contactPhone}`} className="hover:text-white">{contactPhone}</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
