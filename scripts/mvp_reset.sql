-- ============================================================
-- FrontBill MVP Reset Script
-- Run this in your Supabase SQL Editor to wipe all generated
-- data while preserving the full schema and RLS policies.
-- ============================================================

-- Disable triggers temporarily so cascade/audit triggers
-- do not interfere with bulk deletes
SET session_replication_role = replica;

-- ----------------------------------------------------------------
-- 1. Transactional / folio data
-- ----------------------------------------------------------------
TRUNCATE TABLE folio_charges   RESTART IDENTITY CASCADE;
TRUNCATE TABLE payments        RESTART IDENTITY CASCADE;
TRUNCATE TABLE transactions    RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------
-- 2. Booking & reservation data
-- ----------------------------------------------------------------
TRUNCATE TABLE bookings        RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------
-- 3. Guest & account data
-- ----------------------------------------------------------------
TRUNCATE TABLE city_ledger_accounts RESTART IDENTITY CASCADE;
TRUNCATE TABLE guests               RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------
-- 4. Rooms (keep room types/categories if they exist separately)
-- ----------------------------------------------------------------
TRUNCATE TABLE rooms           RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------
-- 5. Organization users / profiles
--    (deletes profile rows; auth.users must be removed separately
--     from the Supabase dashboard → Authentication → Users)
-- ----------------------------------------------------------------
TRUNCATE TABLE profiles        RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------
-- 6. Top-level: organizations
-- ----------------------------------------------------------------
TRUNCATE TABLE organizations   RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------
-- 7. Roles / permissions seed data is preserved intentionally
--    so that newly created users inherit the correct roles.
-- ----------------------------------------------------------------

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- ============================================================
-- DONE: All generated data removed. Schema is intact.
--
-- NEXT STEPS:
-- 1. Go to Supabase Dashboard -> Authentication -> Users
-- 2. Select all users and delete them (auth users are not
--    accessible via plain SQL for security reasons).
-- 3. Create your first admin account via the app sign-up page.
-- ============================================================
