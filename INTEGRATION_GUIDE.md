# FrontBill Supabase Integration Guide

## Overview

FrontBill is now fully integrated with Supabase for real-time data management. This guide explains the complete setup and how to test the integration.

## Database Setup

The following database migrations have been applied:

### 1. Schema Migration (`001_create_schema`)
Creates all core tables:
- `organizations` - Hotel/guesthouse information
- `profiles` - User profiles linked to auth.users
- `rooms` - Room inventory with pricing and amenities
- `guests` - Guest database with identification
- `bookings` - Guest reservations with folio tracking
- `payments` - Payment records with balance tracking
- `city_ledger_accounts` - Organization ledger accounts
- `night_audits` - Daily audit records
- `transactions` - Financial transactions

### 2. RLS Policies (`002_rls_policies`)
Row Level Security ensures:
- Users can only access their organization's data
- Multi-tenant data isolation
- Automatic filtering based on auth.uid()

### 3. Triggers & Real-time (`003_triggers_realtime`)
Database triggers handle:
- Automatic `updated_at` timestamps
- Folio ID generation (YYYYMMXXXXX format)
- Booking detail calculations (nights, totals, balances)
- Room status synchronization with bookings
- Payment balance updates
- City ledger balance tracking
- Real-time subscriptions on key tables

### 4. Auto-Profile Creation (`004_auto_profile_creation`)
When users sign up via Supabase Auth:
- Profile is automatically created
- User metadata (full_name, role) is preserved

## Authentication Flow

### Sign Up
1. User fills out form at `/auth/sign-up`
2. Email, password, full_name, and role are sent to Supabase Auth
3. Database trigger creates profile automatically
4. User is redirected to email verification page

### Login
1. User logs in at `/auth/login`
2. Session is stored in httpOnly cookies
3. Middleware refreshes session automatically
4. User is redirected to `/dashboard`

### Logout
1. User clicks logout in header
2. `POST /api/auth/logout` clears the session
3. User is redirected to `/auth/login`

## API Layer

All data operations use server-side Supabase client (`lib/supabase/server.ts`):

### Files
- `lib/api/bookings.ts` - Booking management (CRUD, extend stay)
- `lib/api/guests.ts` - Guest management and search
- `lib/api/rooms.ts` - Room management and availability
- `lib/api/payments.ts` - Payment tracking and reporting
- `lib/api/organizations.ts` - Organization settings
- `lib/api/analytics.ts` - Revenue and occupancy analytics
- `lib/api/ledger.ts` - City ledger account management
- `lib/api/transactions.ts` - Transaction tracking

### Usage Pattern
All API functions are Server Actions ('use server'):
```typescript
// From client components
const bookings = await getBookings(organizationId);
const available = await getAvailableRooms(orgId, checkIn, checkOut);
const payment = await createPayment({ ...paymentData });
```

## Testing the Integration

### 1. Create Test Organization
First, you need to create an organization in the database:

```sql
INSERT INTO organizations (name, email, phone, city, country)
VALUES (
  'Test Hotel',
  'test@testhotel.com',
  '+234123456789',
  'Lagos',
  'Nigeria'
);
```

Note the organization ID returned.

### 2. Sign Up a Test User
1. Go to http://localhost:3000/auth/sign-up
2. Fill in:
   - First Name: Test
   - Last Name: Admin
   - Email: test@example.com
   - Password: Test12345
   - Role: Admin
3. Check email for verification link (or check Supabase Auth dashboard)
4. Complete email verification

### 3. Update User Profile with Organization
After signup, update the profile to link it to your test organization:

```sql
UPDATE profiles
SET organization_id = 'YOUR_ORG_ID_HERE'
WHERE id = 'USER_ID_HERE';
```

Get USER_ID from Supabase Auth users table.

### 4. Create Test Rooms
In Supabase, insert test rooms:

```sql
INSERT INTO rooms (organization_id, room_number, floor_number, room_type, status, price_per_night, max_occupancy, amenities)
VALUES (
  'YOUR_ORG_ID',
  '101',
  1,
  'deluxe',
  'available',
  15000,
  2,
  ARRAY['King Bed', 'WiFi', 'AC', 'TV']
);
```

### 5. Create Test Guest
Insert a test guest:

```sql
INSERT INTO guests (organization_id, name, email, phone, id_type, id_number)
VALUES (
  'YOUR_ORG_ID',
  'John Doe',
  'john@example.com',
  '+234987654321',
  'passport',
  'A12345678'
);
```

### 6. Test the Dashboard
1. Log in with test credentials
2. Go to `/dashboard` - You should see stats, room status, revenue chart
3. Go to `/rooms` - You should see your test rooms
4. Go to `/bookings` - You should see an empty list
5. Try creating a new booking - Folio ID should auto-generate
6. Try adding a payment - Balance should auto-calculate
7. Check real-time updates across different browser tabs

### 7. Verify Real-time Updates
With real-time enabled on key tables:
1. Open bookings page in one window
2. Create a booking in another window
3. The first window should update automatically

## API Endpoint Reference

### Authentication
- `POST /api/auth/callback` - OAuth callback
- `POST /api/auth/logout` - Sign out
- `POST /api/auth/login` - Custom login (for testing)
- `POST /api/auth/sign-up` - Custom signup (for testing)

### AI Features
- `POST /api/ai/guest-insights` - Get AI insights about a guest
- `POST /api/ai/night-audit-summary` - Generate night audit summary
- `POST /api/ai/revenue-recommendation` - Get revenue recommendations

## Troubleshooting

### "Organization not found"
- Make sure the user's profile has an organization_id set
- Check the organizations table exists with data

### "RLS policy issue"
- Verify user is logged in
- Check RLS policies are created correctly
- Ensure organization_id matches between tables

### Real-time not working
- Check supabase_realtime publication includes the table
- Verify real-time is enabled on the Supabase project
- Check browser console for subscription errors

### Profile not created on signup
- Check the `handle_new_user()` trigger exists
- Verify auth.users table has a row for the new user
- Check profiles table for any failed inserts

## Environment Variables

Required environment variables (should be auto-set by v0):
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Next Steps

1. **Test the complete booking flow** - Create guest → Create booking → Add payment
2. **Configure night audit** - Run night audit for a date
3. **Generate reports** - Use analytics API for revenue reports
4. **Set up city ledger** - Create organization ledger accounts
5. **Test real-time** - Subscribe to table changes

## Support

For issues or questions:
1. Check Supabase logs: Project Settings → Logs
2. Check browser console for client-side errors
3. Check Next.js terminal for server-side errors
4. Verify RLS policies in Supabase dashboard
5. Check real-time subscriptions in Network tab
