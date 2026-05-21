-- Optional file attachments on hotel events (images/PDF)
-- Run after 055_hotel_events_payment.sql

CREATE TABLE IF NOT EXISTS public.event_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.hotel_events(id) ON DELETE CASCADE,
  remarks TEXT,
  file_url TEXT,
  file_name TEXT,
  content_type TEXT,
  file_size_bytes BIGINT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_attachments_event
  ON public.event_attachments (event_id, created_at DESC);

ALTER TABLE public.event_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_attachments_org ON public.event_attachments;
CREATE POLICY event_attachments_org ON public.event_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = event_attachments.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = event_attachments.organization_id
    )
  );
