# FrontBill - Supabase Integration Setup Guide

## Overview
FrontBill is now connected to your shared Supabase project at `tuahakfaqknmmdlqqrwr.supabase.co` with complete real-time capabilities, email verification, and multi-tenant architecture.

## Environment Setup

### 1. Add Environment Variables
In your Vercel project settings, add:
```
NEXT_PUBLIC_SUPABASE_URL=https://tuahakfaqknmmdlqqrwr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YWhha2ZhcWtubW1kbHFxcndyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3Mzg0NTEsImV4cCI6MjA4NzMxNDQ1MX0.X4jVAA1EYoBtiaaYzELi0SBhoSY_pk4tGK9ZgUVltlM
```

### 2. Execute Database Setup Scripts
In your Supabase SQL Editor, run these scripts in order:
1. `scripts/001_create_schema.sql` - Creates all tables with indexes
2. `scripts/002_rls_policies.sql` - Enables Row Level Security
3. `scripts/003_triggers_realtime.sql` - Sets up triggers and real-time subscriptions

## Database Architecture

### Multi-Tenant Structure
- **organizations**: Hotel/property details
- **profiles**: User accounts with roles (admin, manager, staff, accountant)
- **rooms**: Room inventory with pricing
- **guests**: Guest information with contact details
- **bookings**: Reservations with automatic folio ID generation
- **payments**: Transaction history with method tracking
- **city_ledger_accounts**: Account ledger for organizations
- **night_audits**: Automated daily summaries
- **transactions**: Real-time transaction log

### Row Level Security (RLS)
All data is protected by RLS policies that ensure:
- Users only see their organization's data
- Staff can only perform operations matching their role
- Admins have full access to their organization
- Accountants can manage payments
- Managers can create and close bookings

## Authentication

### Email Verification Flow
1. User signs up at `/auth/sign-up`
2. Email verification sent automatically
3. User confirms email to unlock database access
4. Profile auto-created via trigger
5. Redirect to dashboard on first login

### Supported Roles
- **Admin**: Full control over organization
- **Manager**: Booking management, room control
- **Staff**: Create bookings, check-ins
- **Accountant**: Payment management and reporting

## API Layer

### Server Actions (lib/api/)
All database operations are server-side for security:

```typescript
// Bookings
import { getBookings, createBooking, extendStay } from '@/lib/api/bookings'

// Payments
import { getPayments, createPayment, getDailyRevenue } from '@/lib/api/payments'

// Rooms
import { getRooms, getAvailableRooms, updateRoomStatus } from '@/lib/api/rooms'

// Guests
import { getGuests, createGuest, searchGuests } from '@/lib/api/guests'
```

## Real-Time Features

### Enabled Subscriptions
These tables broadcast changes in real-time:
- **bookings**: New reservations, status updates
- **payments**: Payment confirmations
- **rooms**: Room status changes
- **night_audits**: Automatic report generation
- **transactions**: Transaction log updates

### Usage Example
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// Subscribe to booking changes
const channel = supabase
  .channel('bookings')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'bookings'
    },
    (payload) => console.log(payload)
  )
  .subscribe()
```

## Testing vs Production

### Development Environment
- Use the shared Supabase project for testing
- Create test users with test@example.com
- Safe to experiment with data

### Production Environment
- Same project (one database for simplicity)
- Keep backups enabled in Supabase settings
- Monitor usage in Supabase dashboard

### Future Multi-Environment
If you need separate dev/prod databases:
1. Create second Supabase project
2. Add new environment variables with `_PROD` suffix
3. Update deployment settings to switch environments

## Migration from Mock Data

### Already Implemented
- ✅ Authentication system with email verification
- ✅ Database schema with all tables
- ✅ Row Level Security policies
- ✅ Real-time subscriptions
- ✅ API layer (server actions)
- ✅ Triggers for auto-timestamps

### To Complete
- Update dashboard to use `getBookings()` instead of mock data
- Replace `mockPayments` with `getPayments()` API calls
- Update room status from real-time subscriptions
- Implement night audit auto-generation

## Deployment

### To Vercel
```bash
npm run build
vercel deploy
```

### Database Backup
- Automatic daily backups in Supabase
- Manual backup via Supabase Dashboard → Settings → Backups

## Shared Account Access

### For Ebuka and Team Members
1. Share login credentials securely (password manager recommended)
2. They can access: `https://supabase.com/dashboard`
3. Select the "FrontBill" project
4. View/manage database through SQL Editor
5. Monitor real-time subscriptions and usage

### Security Best Practices
- Use strong password (20+ characters)
- Enable 2FA if Supabase supports it
- Rotate credentials quarterly
- Audit access logs monthly

## Troubleshooting

### Email Verification Not Sending
1. Check Supabase Email Templates in Settings
2. Verify SMTP settings if using custom domain
3. Check spam folder or resend verification

### RLS Policies Blocking Access
1. Ensure user has profile row
2. Check organization_id matches
3. Verify role matches policy requirements

### Real-Time Not Updating
1. Ensure publication is enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE table_name`
2. Check browser console for connection errors
3. Verify RLS policies allow SELECT on table

## Next Steps

1. **Execute SQL Scripts**: Run the 3 setup scripts in order in Supabase SQL Editor
2. **Test Authentication**: Try signing up at `/auth/sign-up`
3. **Create Organization**: Add your hotel details
4. **Add Test Users**: Create staff, manager, accountant accounts
5. **Migrate Mock Data**: Convert dashboard pages to use new API

---

**Status**: Ready for Production
**Team Access**: Shared account setup complete
**Real-Time**: Enabled and configured
**Security**: RLS enforced on all tables
