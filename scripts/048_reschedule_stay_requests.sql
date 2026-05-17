-- Reschedule stay (move dates) requests: front desk submits; superadmin / admin / manager approves.
-- On approval the API updates booking check_in, check_out, nights, totals, and room hold.

CREATE TABLE IF NOT EXISTS public.reschedule_stay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  from_check_in DATE NOT NULL,
  from_check_out DATE NOT NULL,
  to_check_in DATE NOT NULL,
  to_check_out DATE NOT NULL,
  is_backdate BOOLEAN NOT NULL DEFAULT FALSE,
  folio_label TEXT,
  guest_label TEXT,
  room_label TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT reschedule_stay_distinct_dates CHECK (
    from_check_in <> to_check_in OR from_check_out <> to_check_out
  ),
  CONSTRAINT reschedule_stay_valid_range CHECK (to_check_in < to_check_out)
);

CREATE INDEX IF NOT EXISTS idx_reschedule_stay_requests_org_status
  ON public.reschedule_stay_requests (organization_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reschedule_stay_org_booking_pending
  ON public.reschedule_stay_requests (organization_id, booking_id)
  WHERE (status = 'pending');

ALTER TABLE public.reschedule_stay_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reschedule_stay_select_org ON public.reschedule_stay_requests;
CREATE POLICY reschedule_stay_select_org ON public.reschedule_stay_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = reschedule_stay_requests.organization_id
        AND (
          p.role IN ('superadmin', 'admin', 'manager')
          OR reschedule_stay_requests.requested_by = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS reschedule_stay_insert_requester ON public.reschedule_stay_requests;
CREATE POLICY reschedule_stay_insert_requester ON public.reschedule_stay_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = reschedule_stay_requests.organization_id
    )
  );

DROP POLICY IF EXISTS reschedule_stay_update_deciders ON public.reschedule_stay_requests;
CREATE POLICY reschedule_stay_update_deciders ON public.reschedule_stay_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = reschedule_stay_requests.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = reschedule_stay_requests.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager')
    )
  );

COMMENT ON TABLE public.reschedule_stay_requests IS 'Move check-in/check-out on reserved or confirmed folios; approval updates booking dates and totals.';
