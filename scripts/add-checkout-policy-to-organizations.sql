-- Add checkout policy columns to organizations table
-- Run this in your Supabase SQL Editor

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS checkout_time TEXT NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS late_checkout_fee_per_hour NUMERIC(12,2);
