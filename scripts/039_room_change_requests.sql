-- Room change requests: front desk submits; superadmin / admin / manager approves.
-- On approval the API updates booking.room_id, room statuses, and inserts a folio_note line.

CREATE TABLE IF NOT EXISTS public.room_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  to_room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  from_room_label TEXT NOT NULL,
  to_room_label TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT room_change_distinct_rooms CHECK (from_room_id <> to_room_id)
);

CREATE INDEX IF NOT EXISTS idx_room_change_requests_org_status
  ON public.room_change_requests (organization_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_change_org_booking_pending
  ON public.room_change_requests (organization_id, booking_id)
  WHERE (status = 'pending');

ALTER TABLE public.room_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_change_select_org ON public.room_change_requests;
CREATE POLICY room_change_select_org ON public.room_change_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = room_change_requests.organization_id
        AND (
          p.role IN ('superadmin', 'admin', 'manager')
          OR room_change_requests.requested_by = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS room_change_insert_requester ON public.room_change_requests;
CREATE POLICY room_change_insert_requester ON public.room_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = room_change_requests.organization_id
    )
  );

DROP POLICY IF EXISTS room_change_update_deciders ON public.room_change_requests;
CREATE POLICY room_change_update_deciders ON public.room_change_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = room_change_requests.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = room_change_requests.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager')
    )
  );

COMMENT ON TABLE public.room_change_requests IS 'Mid-stay room move requests; approval applies booking.room_id and logs folio_note.';
