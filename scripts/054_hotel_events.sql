-- Hotel events (banquets, conferences, hall hire) — Reservations/Events module
-- Run in Supabase SQL Editor after 053_outlet_daily_reports.sql

CREATE TABLE IF NOT EXISTS public.hotel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  venue TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'confirmed', 'cancelled', 'completed')),
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  expected_attendees INT CHECK (expected_attendees IS NULL OR expected_attendees >= 0),
  estimated_value NUMERIC(12, 2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_hotel_events_org_dates
  ON public.hotel_events(organization_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_hotel_events_org_status
  ON public.hotel_events(organization_id, status);

ALTER TABLE public.hotel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_events_org ON public.hotel_events;
CREATE POLICY hotel_events_org ON public.hotel_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = hotel_events.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = hotel_events.organization_id
    )
  );
