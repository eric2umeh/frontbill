# FrontBill - Hotel Financial Accountability System

**GitHub Repository**: https://github.com/eric2umeh/frontbill

A comprehensive hotel management system designed to track every financial detail of guest interactions, room bookings, and payments with complete accountability and fraud prevention.

## Problem Statement

Hotels face significant revenue leakage due to front desk staff misreporting payments, especially when:
- Bookings are made in arrears
- Payments are received but not accurately recorded
- Corporate clients pay for individual guests without proper tracking
- Multiple payment methods create confusion in accounting

**FrontBill** solves this by providing an immutable audit trail of all transactions with role-based access control and anomaly detection.

## Key Features

### Core Functionality
- **Guest Management**: Complete guest profiles with ID verification and organizational affiliations
- **Room Management**: Real-time room status tracking (available, occupied, maintenance, etc.)
- **Booking System**: Reservations with or without payment, check-in/check-out tracking
- **Payment Processing**: Multiple methods (Cash, POS, Transfer, Cheque, Credit) with complete audit trail
- **City Ledger**: Track organizational debts and credit accounts separately
- **Revenue Analytics**: Detailed breakdown by payer, guest, date, method, and status
- **Reconciliation Engine**: End-of-shift reconciliation with automatic anomaly detection

### Financial Accountability
- Every transaction linked to specific staff member
- Immutable activity log for all operations
- Payment status tracking (Pending, Partial, Paid, Arrears)
- Real-time balance calculations
- Corporate vs Individual payer differentiation

### Reporting & Documents
All documents follow corporate template with:
- Hotel logo and branding
- Date and reference numbers
- Tabulated breakdowns
- Summary cards with totals
- Preparer information and signature lines
- Print-ready A4 format

**Available Reports**:
- Daily Revenue Report (complete breakdown)
- Guest Folio / Invoice
- Organization Statements
- Payment Receipts
- Shift Reconciliation Reports
- Booking Confirmations

### User Roles
- **Admin**: Full system access
- **Manager**: Approve reconciliations, view all reports
- **Front Desk**: Guest check-in, bookings, payments
- **Accountant**: Financial reports, ledger management

## Technology Stack

- **Frontend**: Next.js 16, React 19.2, TypeScript
- **UI**: Tailwind CSS, shadcn/ui, Radix UI
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Charts**: Recharts
- **PDF Export**: jspdf + html2canvas
- **Date Handling**: date-fns
- **Deployment**: Vercel

## Database Schema

### Core Tables
- `profiles` - User accounts and roles
- `rooms` - Room inventory and rates
- `guests` - Guest information
- `organizations` - Corporate/government accounts
- `bookings` - Reservations and check-ins
- `payments` - All payment transactions
- `city_ledger` - Organization debt tracking
- `activities` - Audit trail
- `reconciliations` - Shift-end reconciliation

All tables protected with Row Level Security (RLS) policies.

## Currency

All amounts are in **Nigerian Naira (₦)**

## Setup Instructions

### Prerequisites
- Node.js 18+
- Supabase account
- Vercel account (for deployment)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/eric2umeh/frontbill.git
cd frontbill
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure Supabase:
   - Create a new Supabase project
   - Run all SQL scripts in `/scripts` folder in order (001 through 010)
   - Set environment variables in Vercel or `.env.local`:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`

4. Run development server:
```bash
pnpm dev
```

5. Access at `http://localhost:3000`

### Default Login
```
Email: admin@hotel.com
Password: password123
```

## Deployment

### Vercel Deployment
1. Connect GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on every push to main branch

### Supabase Setup
1. Run migrations in order from `/scripts` folder
2. Enable Row Level Security on all tables
3. Configure authentication providers if needed

## Project Structure

```
frontbill/
├── app/
│   ├── (dashboard)/          # Protected dashboard routes
│   │   ├── dashboard/        # Main dashboard
│   │   ├── guests/           # Guest management
│   │   ├── rooms/            # Room inventory
│   │   ├── bookings/         # Reservations
│   │   ├── payments/         # Payment tracking
│   │   ├── ledger/           # City ledger
│   │   ├── organizations/    # Corporate accounts
│   │   ├── analytics/        # Revenue analytics
│   │   ├── reconciliation/   # Shift reconciliation
│   │   ├── reports/          # Reports & documents
│   │   └── settings/         # System settings
│   ├── auth/                 # Authentication pages
│   └── globals.css           # Global styles & design tokens
├── components/
│   ├── dashboard/            # Dashboard widgets
│   ├── guests/               # Guest components
│   ├── bookings/             # Booking components
│   ├── payments/             # Payment components
│   ├── organizations/        # Organization components
│   ├── analytics/            # Analytics components
│   ├── layout/               # Sidebar, header
│   └── shared/               # Reusable components
├── lib/
│   ├── supabase/             # Supabase client setup
│   ├── types/                # TypeScript types
│   └── utils/                # Utility functions
├── scripts/                  # SQL migration scripts
└── README.md
```

## API Integration

All database operations use Supabase client. Example usage:

```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: guests } = await supabase
  .from('guests')
  .select('*')
  .order('created_at', { ascending: false })
```

## Mobile Responsiveness

- Sidebar collapses on mobile
- Tables show 3-5 columns max on mobile (hidden columns via Tailwind `md:`, `lg:` prefixes)
- Paginated data tables (10-20 items per page)
- Touch-friendly buttons and cards
- Responsive grid layouts

## Security Features

- Row Level Security (RLS) on all tables
- Authentication via Supabase Auth
- Role-based access control
- Activity logging for audit trail
- Secure password hashing (bcrypt via Supabase)

## Contributing

This project is developed by Eric Umeohabike for hotel financial accountability. For contributions or issues, please create a GitHub issue.

## License

Proprietary - All rights reserved

## Support

For support or questions:
- GitHub Issues: https://github.com/eric2umeh/frontbill/issues
- Email: Contact via GitHub profile

---

**Built with ❤️ for the hospitality industry in Nigeria**
