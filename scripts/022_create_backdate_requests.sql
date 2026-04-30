CREATE TABLE IF NOT EXISTS public.backdate_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('booking', 'reservation', 'bulk_booking')),
  requested_check_in DATE NOT NULL,
  requested_check_out DATE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_backdate_requests_org_status
  ON public.backdate_requests (organization_id, status, created_at DESC);

ALTER TABLE public.backdate_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view backdate requests in their hotel" ON public.backdate_requests;
CREATE POLICY "Users can view backdate requests in their hotel"
ON public.backdate_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = backdate_requests.organization_id
      AND (
        p.role IN ('superadmin', 'admin')
        OR backdate_requests.requested_by = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "Staff can create backdate requests" ON public.backdate_requests;
CREATE POLICY "Staff can create backdate requests"
ON public.backdate_requests FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = backdate_requests.organization_id
  )
);

DROP POLICY IF EXISTS "Superadmins can decide backdate requests" ON public.backdate_requests;
CREATE POLICY "Superadmins can decide backdate requests"
ON public.backdate_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = backdate_requests.organization_id
      AND p.role = 'superadmin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = backdate_requests.organization_id
      AND p.role = 'superadmin'
  )
);
