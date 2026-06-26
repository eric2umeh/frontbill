import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowLeft,
  CheckCircle2,
  Globe2,
  Hotel,
  Mail,
  Phone,
  Sparkles,
  Star,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const contactEmail = 'frontbill.tech@gmail.com'
const contactPhone = '+2348180329799'

export const metadata: Metadata = {
  title: 'FrontBill Pricing | Hotel PMS, POS, Inventory & Booking Website Plans',
  description:
    'View FrontBill launch pricing for hotels, guest houses, serviced apartments, restaurants, store control, night audit, and custom hotel booking websites.',
  keywords: [
    'FrontBill pricing',
    'hotel PMS pricing Nigeria',
    'hotel software price',
    'hotel booking website price',
    'hotel inventory software',
    'restaurant POS for hotels',
  ],
  openGraph: {
    title: 'FrontBill Pricing',
    description:
      'Launch pricing for hotel operations software, kitchen and store control, outlets, and custom booking websites.',
    type: 'website',
  },
}

const plans = [
  {
    name: 'Starter',
    originalPrice: '₦95,000',
    price: '₦55,000',
    setup: '₦150,000 launch setup',
    description: 'For small hotels, guest houses, and serviced apartments getting organized.',
    highlight: false,
    features: [
      'Up to 25 rooms',
      'Bookings and reservations',
      'Guest database and folios',
      'Payments and basic reports',
      'Room status and housekeeping',
      '2 admin users',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    originalPrice: '₦180,000',
    price: '₦120,000',
    setup: '₦300,000 launch setup',
    description: 'For growing hotels that need approvals, store control, outlets, and stronger reporting.',
    highlight: true,
    features: [
      'Up to 75 rooms',
      'Everything in Starter',
      'Night audit and approvals',
      'City ledger and organizations',
      'Central Store and purchasing',
      'Kitchen production and F&B stock',
      'Restaurant/outlet sales tracking',
      '10 users with role permissions',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    originalPrice: '₦350,000+',
    price: '₦250,000+',
    setup: 'Custom setup',
    description: 'For larger hotels, groups, resorts, and properties that need custom workflows.',
    highlight: false,
    features: [
      'Unlimited rooms by agreement',
      'Multi-outlet operations',
      'Advanced reports and controls',
      'Custom approval workflows',
      'Migration support',
      'Dedicated onboarding',
      'Custom integrations',
      'SLA and premium support',
    ],
  },
]

const websiteAddOns = [
  {
    name: 'Booking Website',
    price: 'from ₦850,000',
    description: 'Custom hotel website with rooms, galleries, direct booking forms, SEO basics, and FrontBill availability sync.',
  },
  {
    name: 'Website + SEO Growth',
    price: 'from ₦1,500,000',
    description: 'Website, content structure, technical SEO, Google Business optimization, and launch support for direct bookings.',
  },
  {
    name: 'Booking Engine Add-on',
    price: '₦75,000 / month',
    description: 'Online room, hall, event, and bulk booking requests that appear inside FrontBill for the selected date range.',
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 text-sm text-slate-300 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <Button className="rounded-full bg-white text-slate-950 hover:bg-blue-50" asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </div>

          <div className="mx-auto max-w-3xl py-16 text-center">
            <Badge className="mb-5 rounded-full bg-blue-500 text-white hover:bg-blue-500">
              Practical pricing for real hotel operations
            </Badge>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              Choose the FrontBill plan that fits your property.
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Start with hotel operations, then add a custom booking website when you are ready to grow direct bookings,
              SEO, and online presence.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative overflow-hidden border-slate-200 bg-white shadow-sm ${
                plan.highlight ? 'border-blue-500 shadow-xl shadow-blue-100' : ''
              }`}
            >
              {plan.highlight ? (
                <div className="absolute right-4 top-4">
                  <Badge className="gap-1 bg-blue-600 text-white hover:bg-blue-600">
                    <Star className="h-3.5 w-3.5" />
                    Popular
                  </Badge>
                </div>
              ) : null}
              <CardContent className="p-7">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Hotel className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-black">{plan.name}</h2>
                <p className="mt-2 min-h-14 text-sm leading-6 text-slate-600">{plan.description}</p>
                <div className="mt-6">
                  <div className="flex items-end gap-3">
                    <p className="text-4xl font-black">{plan.price}</p>
                    <p className="pb-1 text-lg font-bold text-slate-400 line-through">{plan.originalPrice}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">per month + {plan.setup}</p>
                  <Badge variant="secondary" className="mt-3 rounded-full">
                    Launch discount for early hotel clients
                  </Badge>
                </div>
                <Button className={`mt-7 w-full rounded-full ${plan.highlight ? 'bg-blue-600 hover:bg-blue-500' : ''}`} asChild>
                  <a href={`mailto:${contactEmail}?subject=FrontBill%20${plan.name}%20plan%20enquiry`}>
                    Enquire about {plan.name}
                  </a>
                </Button>
                <div className="mt-7 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] bg-slate-950 p-6 text-white sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <Badge className="mb-4 rounded-full bg-white text-slate-950 hover:bg-white">
                Website and direct booking add-ons
              </Badge>
              <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
                Sell the dashboard and the hotel website together.
              </h2>
              <p className="mt-4 text-slate-300">
                A hotel can run operations in FrontBill while guests book from a custom website. Room, hall, event,
                and bulk booking requests can reserve the selected dates inside the dashboard.
              </p>
            </div>
            <div className="grid gap-4">
              {websiteAddOns.map((addon) => (
                <div key={addon.name} className="rounded-2xl border border-white/10 bg-white/10 p-5">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        {addon.name.includes('SEO') ? (
                          <Sparkles className="h-5 w-5 text-amber-300" />
                        ) : (
                          <Globe2 className="h-5 w-5 text-blue-300" />
                        )}
                        <h3 className="font-bold">{addon.name}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{addon.description}</p>
                    </div>
                    <p className="shrink-0 text-lg font-black">{addon.price}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-[2rem] border bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Badge variant="secondary" className="mb-4 rounded-full">
              Talk to FrontBill
            </Badge>
            <h2 className="text-2xl font-black tracking-tight sm:text-4xl">
              Need help choosing a plan?
            </h2>
            <p className="mt-3 max-w-3xl text-slate-600">
              Contact us with your room count, number of outlets, and whether you want a custom hotel website.
              We will advise the best launch package and onboarding cost.
            </p>
            <div className="mt-5 flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:gap-5">
              <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 font-medium hover:text-blue-700">
                <Mail className="h-4 w-4 text-blue-600" />
                {contactEmail}
              </a>
              <a href={`tel:${contactPhone}`} className="flex items-center gap-2 font-medium hover:text-blue-700">
                <Phone className="h-4 w-4 text-emerald-600" />
                {contactPhone}
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button className="rounded-full bg-slate-950 text-white hover:bg-slate-800" asChild>
              <a href={`mailto:${contactEmail}?subject=FrontBill%20pricing%20enquiry`}>
                Email for pricing
              </a>
            </Button>
            <Button variant="outline" className="rounded-full" asChild>
              <a href={`tel:${contactPhone}`}>Call sales</a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t bg-white px-4 py-8 text-sm text-slate-500 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} FrontBill. Launch pricing is available for early hotel partners.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            <a href={`mailto:${contactEmail}`} className="hover:text-slate-950">{contactEmail}</a>
            <a href={`tel:${contactPhone}`} className="hover:text-slate-950">{contactPhone}</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
