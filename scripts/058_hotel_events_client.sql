-- Link hotel events to guests or counterparty organizations (like bookings/reservations)
-- Run after 054_hotel_events.sql

ALTER TABLE public.hotel_events
  ADD COLUMN IF NOT EXISTS client_type TEXT
    CHECK (client_type IS NULL OR client_type IN ('guest', 'organization')),
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_events_guest ON public.hotel_events (guest_id);
CREATE INDEX IF NOT EXISTS idx_hotel_events_client_org ON public.hotel_events (client_organization_id);

COMMENT ON COLUMN public.hotel_events.client_type IS 'guest = individual; organization = B2B counterparty from Organizations menu';
COMMENT ON COLUMN public.hotel_events.guest_id IS 'Set when client_type is guest';
COMMENT ON COLUMN public.hotel_events.client_organization_id IS 'Set when client_type is organization';
