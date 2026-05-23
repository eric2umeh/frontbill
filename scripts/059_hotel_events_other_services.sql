-- Other venue services (corkage, tea break, buffet lunch, dinner) with line prices
-- Run in Supabase SQL Editor after 058_hotel_events_client.sql

ALTER TABLE public.hotel_events
  ADD COLUMN IF NOT EXISTS other_services JSONB DEFAULT NULL;

COMMENT ON COLUMN public.hotel_events.other_services IS
  'When venue is Other: JSON array [{ "type": "corkage", "amount": 50000 }, ...]';
