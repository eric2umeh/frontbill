# FrontBill Database Schema

## Overview
Updated schema aligned with new menu structure: Bookings, Reservations, Guest Database, Rooms, Transactions, Organizations, Analytics, Reconciliation, Reports, Settings.

## Core Tables

### 1. profiles
User accounts for staff members.
- `role`: admin, manager, front_desk, accountant
- RLS enabled for security

### 2. organizations
Corporate/Government/NGO accounts with city ledger.
- `current_balance`: Amount organization owes hotel (starts at 0)
- `credit_limit`: Maximum allowed balance
- `total_transactions`: Running total of all transactions
- Balance tracking via triggers

### 3. guests  
Individual guest records with booking history.
- `current_balance`: Guest balance (positive = owes, negative = credit)
- `total_spent`: Lifetime spending
- `total_bookings`: Number of bookings
- `organization_id`: Link to corporate account if applicable

### 4. rooms
Hotel room inventory.
- `status`: available, occupied, reserved, cleaning, maintenance
- `room_type`: deluxe, royal, king, mini, executive, diplomatic
- `rate_per_night`: Standard nightly rate

### 5. bookings
All reservations and active bookings.
- `is_reservation`: TRUE if check_in is in future
- `status`: reserved, checked_in, checked_out, no_show, cancelled
- `payment_status`: paid, partial, pending, arrears
- `guest_type`: walkin, reservation, organization
- `room_price_override`: Custom rate if different from standard
- `balance`: Remaining amount owed

### 6. payments (IMMUTABLE)
Append-only transaction ledger.
- `transaction_id`: Unique identifier (TXN20240115-1234)
- `method`: cash, pos, transfer, corporate_account
- `is_city_ledger`: TRUE for city ledger transactions
- `payer_type`: individual, corporate, government, ngo
- No UPDATE/DELETE allowed - only INSERT and SELECT
- Triggers update balances automatically

### 7. reconciliations
Shift-based payment reconciliation.
- `shift_type`: morning, afternoon, night
- `status`: pending, approved, flagged
- `variance`: Difference between expected and actual
- Method breakdown: cash, pos, transfer
- `anomaly_flags`: JSON array of detected issues

### 8. activities
Audit trail of all system actions.
- `activity_type`: create, update, delete, check_in, check_out
- `entity_type`: booking, payment, guest, room
- Immutable log for accountability

## Views

### active_bookings
All current bookings (reserved or checked_in).
```sql
WHERE status IN ('reserved', 'checked_in')
```

### future_reservations  
Bookings with check_in date in future.
```sql
WHERE status = 'reserved' AND check_in > current_date
```

### all_transactions
Complete payment history with guest/org details.
```sql
WHERE voided = false
ORDER BY created_at DESC
```

## Triggers

### update_guest_balance
Automatically adjusts guest balance on payment.
- Direct payments: Reduces balance
- City ledger: No change to guest balance

### update_organization_balance
Tracks organization city ledger balance.
- Only fires when `is_city_ledger = TRUE`
- Increases org balance by payment amount

### update_booking_balance
Updates booking paid amount and payment status.
- Recalculates balance after each payment
- Updates status: pending → partial → paid

## Key Features

### Balance Tracking
- **Guest Balance**: Positive = debit (owes money), Negative = credit
- **Organization Balance**: Running total of city ledger amounts
- **Booking Balance**: Total - Paid = Balance

### City Ledger
- Can be attached to guest OR organization
- `is_city_ledger` flag on payments
- Separate balance tracking per entity

### Reservation vs Booking
- **Reservation**: Future booking (`check_in > current_date`)
- **Booking**: Active or past booking
- Single table, differentiated by `is_reservation` flag

### Transaction Integrity
- Payments table is append-only (no updates/deletes)
- Transaction IDs auto-generated
- All balance updates via triggers
- Activity log for audit trail

## Migration Order

1. Run existing schema scripts (001-010)
2. Run `011_update_schema_for_new_structure.sql`
3. Run `012_seed_comprehensive_data.sql`

## Indexes

Performance indexes on:
- `bookings.status`
- `bookings.check_in`
- `bookings.is_reservation`
- `payments.method`
- `payments.is_city_ledger`
- `guests.current_balance`
- `organizations.current_balance`

## Security

- Row Level Security (RLS) enabled on all tables
- Authenticated users can read all data
- Only authenticated users can insert/update
- Payments are immutable (no update policy)
