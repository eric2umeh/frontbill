# PR Summary: City Ledger Balance Tracking & Error Fixes

**Branch:** `city-ledger-error`
**Type:** Bug Fix + Feature Enhancement
**Status:** Ready for Review

---

## Overview

This PR addresses critical issues with balance tracking across the FrontBill application, fixes transaction data display problems, resolves modal loading persistence, and implements comprehensive city ledger charge management with real-time balance updates.

---

## Issues Fixed

### 1. **Guest Balance Shows 0 Instead of Unpaid City Ledger Charges**
- **Problem:** Guest balances displayed 0 even when city ledger charges existed
- **Root Cause:** Balance calculation only looked at `bookings.balance` column instead of summing `folio_charges`
- **Solution:** 
  - Created `lib/balance.ts` with batch balance calculation utilities
  - Implemented `calculateGuestBalancesBatch()` to fetch all bookings and sum unpaid `folio_charges`
  - Implemented `calculateOrganizationBalancesBatch()` for organization-level balances
  - All balances now calculated from `folio_charges` table with `payment_status='unpaid'`

### 2. **Modal Loading Persists After Close**
- **Problem:** Loading spinner remained on screen after closing booking/reservation modals
- **Root Cause:** Early returns in fetch functions didn't call `setLoading(false)`; modal callbacks triggered fetches without cleanup
- **Solution:**
  - Added `finally { setLoading(false) }` blocks to all modal data fetch functions
  - Added early-return loading resets in `bookings/page.tsx` and `reservations/page.tsx`
  - Implemented `useEffect` cleanup with `isMounted` flag to prevent state updates after unmount
  - Booking and reservation modals now properly reset loading state on close

### 3. **Transactions Table Shows No Data**
- **Problem:** Transaction list appeared empty despite records existing in database
- **Root Cause:** Complex multi-table join with timezone-based date filtering caused data to be filtered out
- **Solution:**
  - Simplified `fetchPayments()` to single robust query: fetch all payments, filter client-side by date
  - Removed problematic `folio_charges` join that was deduplicating records
  - Now only queries `payments` table (single source of truth for all payment events)
  - Client-side date filtering now handles both ISO and date-only strings correctly
  - Added batch user profile fetch to show actual full names instead of truncated IDs

### 4. **City Ledger Charges Not Reflecting in Balance**
- **Problem:** Adding charges via extend-stay or add-charge didn't update guest/organization balance display across app
- **Root Cause:** Balance updates were direct table updates that didn't trigger recalculation; balance utility wasn't used consistently
- **Solution:**
  - Removed direct `guests.balance` and `organizations.current_balance` updates
  - All city ledger charges now stored in `folio_charges` with `payment_method='city_ledger'` and `payment_status='unpaid'`
  - Balance utility functions now definitive source of truth across all pages
  - Added real-time balance display in tables using balance utility

### 5. **Reservations Page Throwing PGRST200 Error**
- **Problem:** Foreign key relationship error when fetching created_by profile
- **Root Cause:** Invalid PostgREST join hint `profiles!created_by` — no FK exists in DB
- **Solution:**
  - Removed invalid join hints from query
  - Implemented batch-fetch of profile names in separate query
  - Map names after fetch instead of relying on DB-level FK

### 6. **Reservation Detail Page Sync Params Error**
- **Problem:** "A param property was accessed directly with `params.id`" error in Next.js 16
- **Root Cause:** Synchronous access to `params` which is now async in Next.js 16
- **Solution:**
  - Wrapped `params` access with `React.use(params)` per Next.js 16 requirements
  - Updated to fetch actual reservation data from Supabase instead of mock data
  - Added full CRUD operations for check-in, cancellation, and payment updates

### 7. **Authentication Failed When Opening in New Tab**
- **Problem:** Sessions not persisting across browser tabs
- **Root Cause:** Supabase client missing localStorage storage configuration
- **Solution:**
  - Added explicit `storage: window.localStorage` to `createBrowserClient()`
  - Configured `storageKey: 'supabase-auth-token'` for cross-tab synchronization
  - Enabled `persistSession: true` and `detectSessionInUrl: true`

---

## Features Implemented

### 1. **Add Charge Modal** (`components/bookings/add-charge-modal.tsx`)
- New modal allowing users to add miscellaneous charges to active bookings
- Supports payment methods: cash, POS, card, bank transfer, city ledger
- Auto-selects current guest when city ledger chosen
- Charges stored in `folio_charges` table as unpaid
- Triggers page refresh to update balance immediately

### 2. **Extend Stay Modal Improvements**
- Now auto-selects current guest for city ledger charges (no manual selection needed)
- All extended stay charges stored as unpaid city ledger by default
- Properly integrates with new balance calculation system

### 3. **Transaction Detail Page** (`app/(dashboard)/transactions/[id]/page.tsx`)
- New route to view transaction details
- Shows all transaction information: amount, guest, folio, date/time, payment method, status
- Links back to main transactions list

### 4. **Balance Display in Tables**
- Bookings table: Shows "Bal: ₦X,XXX" in payment status column
- Reservations table: Shows balance below payment status badge
- Guest database: Calculated from all city ledger charges across all bookings
- Organizations: Calculated from all unpaid city ledger charges

### 5. **City Ledger Defaults**
- When payment method is "city_ledger", system auto-selects:
  - Current guest (for individual accounts)
  - Prompts for organization selection if org account needed
- Eliminates manual selection friction in common workflows

---

## Files Modified

### Core Utilities
- `lib/balance.ts` — NEW: Batch balance calculation functions
- `lib/supabase/client.ts` — Fixed localStorage session persistence

### Pages
- `app/(dashboard)/bookings/page.tsx` — Added AddChargeModal, improved fetch cleanup, added balance display
- `app/(dashboard)/reservations/page.tsx` — Fixed PGRST200 error, added balance display, improved cleanup
- `app/(dashboard)/transactions/page.tsx` — Simplified fetch, fixed data display, added user name batch fetch
- `app/(dashboard)/reservations/[id]/page.tsx` — Fixed Next.js 16 params access, added real Supabase fetch
- `app/(dashboard)/guest-database/page.tsx` — Added batch balance calculation, fixed formatNaira import
- `app/(dashboard)/organizations/page.tsx` — Added dynamic balance calculation, fixed formatNaira import

### Components
- `components/bookings/extend-stay-modal.tsx` — Auto-select guest for city ledger, removed direct balance updates
- `components/bookings/add-charge-modal.tsx` — NEW: Full charge creation modal with city ledger support
- `components/bookings/new-booking-modal.tsx` — Fixed syntax error, added finally block to loadData
- `components/reservations/new-reservation-modal.tsx` — Added finally block to loadData

### Other
- `APP_DOCUMENTATION.md` — NEW: Comprehensive 748-line application documentation

---

## Database Changes

No schema migrations required. All features use existing `folio_charges` table:

```sql
-- Charges now stored with:
- charge_type: 'extended_stay' | 'miscellaneous' | 'room_service' | etc.
- payment_method: 'city_ledger' | 'cash' | 'pos' | 'card' | 'bank_transfer'
- payment_status: 'unpaid' | 'partial' | 'paid' | 'pending'
- ledger_account_id: guest_id or organization_id
- ledger_account_type: 'individual' | 'organization'
```

---

## Testing Checklist

- [x] Guest database shows correct unpaid balance for guests with city ledger charges
- [x] Organizations page shows correct unpaid balance
- [x] Extend stay modal auto-selects current guest for city ledger
- [x] Add charge modal works and updates balance immediately
- [x] Transactions table displays all payment records without duplicates
- [x] Modal loading spinner disappears after modal closes
- [x] Balance displays in booking table payment column
- [x] Balance displays in reservation table payment column
- [x] Session persists when opening app in new tab
- [x] Reservation detail page loads actual data from Supabase
- [x] User names display in transactions instead of IDs

---

## Performance Improvements

- **Reduced N+1 queries:** Guest balance calculation now uses single batch query instead of per-guest queries
- **Simplified transactions fetch:** Single query + client-side filter instead of complex joins
- **Batch user profile fetch:** One query for all user names instead of repeated lookups
- **Consistent caching:** Balance utility caches results within page lifecycle

---

## Breaking Changes

None. All changes are backward compatible.

---

## Future Considerations

1. Consider implementing real-time balance updates via Supabase subscriptions
2. Add balance reconciliation job for nightly audit
3. Implement payment reversal/credit notes for overpayments
4. Add balance alerts when guest reaches credit limit
5. Create reports for city ledger aging analysis

---

## Related Issues

- Issue #1846: Balance shows 0 for city ledger accounts
- Issue #1847: Modal loading persists after close
- Issue #1848: Transactions page blank
- Issue #1849: City ledger charges not reflected in balance
- Issue #1850: Authentication failed in new tab

---

## Reviewers

- @eric2umeh
- @team-leads

---

## Deployment Notes

- No database migrations needed
- No environment variable changes
- Safe to deploy to production
- Recommend monitoring balance calculations after deployment
- Consider running data validation script to verify existing balances

