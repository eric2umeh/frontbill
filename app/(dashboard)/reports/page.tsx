import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileText, FileBarChart, Building2, Users, CreditCard } from 'lucide-react'

const reports = [
  {
    title: 'Daily Revenue Report',
    description: 'Complete revenue breakdown for a specific date showing all transactions, payers, and payment methods',
    icon: FileBarChart,
    color: 'text-blue-600 bg-blue-100',
  },
  {
    title: 'Guest Folio / Invoice',
    description: 'Individual guest statement with room charges, payments, and outstanding balance',
    icon: Users,
    color: 'text-green-600 bg-green-100',
  },
  {
    title: 'Organization Statement',
    description: 'Monthly ledger statement for corporate accounts showing charges and payments',
    icon: Building2,
    color: 'text-purple-600 bg-purple-100',
  },
  {
    title: 'Payment Receipt',
    description: 'Individual payment confirmation with transaction details and reference number',
    icon: CreditCard,
    color: 'text-orange-600 bg-orange-100',
  },
  {
    title: 'Shift Reconciliation Report',
    description: 'End-of-shift summary with cash, POS, and transfer reconciliation and anomaly flags',
    icon: FileText,
    color: 'text-red-600 bg-red-100',
  },
  {
    title: 'Booking Confirmation',
    description: 'Reservation confirmation document with guest details, room assignment, and terms',
    icon: FileText,
    color: 'text-teal-600 bg-teal-100',
  },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports & Documents</h1>
        <p className="text-muted-foreground">
          Generate professional documents and export reports in PDF format
        </p>
      </div>

      <Card className="border-2 border-dashed">
        <CardHeader>
          <CardTitle>Architecture Documentation</CardTitle>
          <CardDescription>
            System architecture diagram and technical documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Download Architecture PDF
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => {
          const Icon = report.icon
          return (
            <Card key={report.title} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${report.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{report.title}</CardTitle>
                  </div>
                </div>
                <CardDescription className="mt-3">
                  {report.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    View
                  </Button>
                  <Button size="sm" className="flex-1">
                    <Download className="mr-2 h-3 w-3" />
                    PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Features</CardTitle>
          <CardDescription>
            All printable documents include professional formatting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2">
            <li className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Hotel logo and branding
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Date and reference numbers
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Tabulated line-item breakdown
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Summary cards with totals
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Preparer information and signature line
            </li>
            <li className="flex items-center gap-2 text-sm">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              Print-ready A4 format
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
