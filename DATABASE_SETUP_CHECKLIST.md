# FrontBill Database Setup Checklist

## Error You're Seeing
"Database error saving new user" - This means the database trigger that auto-creates user profiles hasn't been set up in your **frontbill team project**.

## Why This Happened
You switched from your **eric2umeh project** (which had the schema set up) to your new **frontbill team project** (which is empty). The env vars now point to the empty project.

## Fix: Run SQL Scripts in Your New Supabase Project

### Step 1: Go to Supabase SQL Editor
1. Visit: https://supabase.com/dashboard/project/...
2. Click **"SQL Editor"** in the left sidebar
3. Click **"New Query"**

### Step 2: Execute Scripts in Order (DO NOT SKIP OR CHANGE ORDER)

**Script 1: Create Tables**
- Copy all content from: `/scripts/001_create_schema.sql`
- Paste into SQL Editor
- Click **"Run"**
- Wait for success message ✓

**Script 2: Enable RLS Policies**
- Copy all content from: `/scripts/002_rls_policies.sql`
- Paste into SQL Editor
- Click **"Run"**
- Wait for success message ✓

**Script 3: Create Triggers & Enable Real-Time**
- Copy all content from: `/scripts/003_triggers_realtime.sql`
- Paste into SQL Editor
- Click **"Run"**
- Wait for success message ✓

### Step 3: Verify Setup
Go to Supabase Dashboard → **"Tables"** in left sidebar.
You should see these tables:
- profiles
- organizations
- rooms
- guests
- bookings
- payments
- transactions
- night_audits
- city_ledger_accounts

### Step 4: Test Auth System
1. Go to your app at `/auth/sign-up`
2. Create a new account
3. Check your email for verification link
4. Click the link to confirm email
5. Login should now work ✓

## Important Notes

**Before Running Scripts:**
- Make sure you're in the correct Supabase project (frontbill team, NOT eric2umeh)
- Check the project URL at top: should say `tuahakfaqknmmdlqqrwr`

**If You Get SQL Errors:**
- Read the error message carefully
- Check that you're copying the ENTIRE script (not partial)
- Make sure each script completes before running the next one

**If Auth Still Fails After Scripts:**
- The trigger should auto-create profiles, but it needs `security definer` privileges
- If it fails, manually create one profile in Supabase dashboard to test

## Quick Test
After all scripts run, try signing up with:
- Email: `test@example.com`
- Password: `Test123456`
- Should receive verification email immediately

Once verified, login works and you see the dashboard with real data!
