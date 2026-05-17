-- Optional staff remarks and file attachments on bookings (reservations, walk-ins, extend stay, etc.)

CREATE TABLE IF NOT EXISTS public.folio_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN (
    'reservation_create',
    'booking_create',
    'extend_stay',
    'extend_stay_discount',
    'reschedule_stay',
    'room_change',
    'manual'
  )),
  source_id UUID,
  remarks TEXT,
  file_url TEXT,
  file_name TEXT,
  content_type TEXT,
  file_size_bytes BIGINT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folio_attachments_booking
  ON public.folio_attachments (booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_folio_attachments_org_source
  ON public.folio_attachments (organization_id, source, source_id);

ALTER TABLE public.folio_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS folio_attachments_select_org ON public.folio_attachments;
CREATE POLICY folio_attachments_select_org ON public.folio_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = folio_attachments.organization_id
    )
  );

DROP POLICY IF EXISTS folio_attachments_insert_org ON public.folio_attachments;
CREATE POLICY folio_attachments_insert_org ON public.folio_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = folio_attachments.organization_id
    )
  );

COMMENT ON TABLE public.folio_attachments IS 'Staff remarks and optional images/PDFs linked to a booking folio.';

-- Storage bucket (public read for front-desk image preview; path includes org id)
INSERT INTO storage.buckets (id, name, public)
VALUES ('folio-attachments', 'folio-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read folio attachments" ON storage.objects;
CREATE POLICY "Public read folio attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'folio-attachments');

DROP POLICY IF EXISTS "Authenticated upload folio attachments" ON storage.objects;
CREATE POLICY "Authenticated upload folio attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'folio-attachments');
