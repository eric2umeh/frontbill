-- Reporting: optional revenue line on folio charges; refunds; extend-stay discount approval queue.
-- Run in Supabase SQL Editor after prior migrations.

-- A. Folio charge tagging (restaurant, halls, etc.) — UI can set explicitly; reports infer if null.
ALTER TABLE public.folio_charges
  ADD COLUMN IF NOT EXISTS revenue_category TEXT;

COMMENT ON COLUMN public.folio_charges.revenue_category IS
  'Optional department key: accommodation, restaurant, bar, laundry, swimming, gym, hall_rebecca, hall_floxy, hall_board_room, events, other.';

-- B. Refunds (deducted from Sales collection totals; not counted as revenue)
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  refund_date DATE NOT NULL,
  reference_payment_date DATE,
  processed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_org_date ON public.refunds (organization_id, refund_date DESC);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refunds_select_org ON public.refunds;
CREATE POLICY refunds_select_org ON public.refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = refunds.organization_id
    )
  );

DROP POLICY IF EXISTS refunds_insert_finance ON public.refunds;
CREATE POLICY refunds_insert_finance ON public.refunds
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = refunds.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
    AND processed_by = auth.uid()
  );

COMMENT ON TABLE public.refunds IS 'Cash refunds to guests; excluded from revenue accrual; net against sales collection in reports.';

-- C. Extend-stay discount approval (front desk requests; manager/admin/superadmin approves)
CREATE TABLE IF NOT EXISTS public.extend_stay_discount_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  new_check_out DATE NOT NULL,
  additional_nights INTEGER NOT NULL CHECK (additional_nights > 0),
  standard_total NUMERIC(14, 2) NOT NULL,
  discounted_total NUMERIC(14, 2) NOT NULL,
  discount_amount NUMERIC(14, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  ledger_account_id UUID,
  ledger_account_type TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT extend_discount_totals CHECK (discounted_total >= 0 AND discounted_total <= standard_total)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_extend_discount_org_booking_pending
  ON public.extend_stay_discount_requests (organization_id, booking_id)
  WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS idx_extend_discount_org_status ON public.extend_stay_discount_requests (organization_id, status, created_at DESC);

ALTER TABLE public.extend_stay_discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS extend_discount_select ON public.extend_stay_discount_requests;
CREATE POLICY extend_discount_select ON public.extend_stay_discount_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = extend_stay_discount_requests.organization_id
        AND (
          p.role IN ('superadmin', 'admin', 'manager')
          OR extend_stay_discount_requests.requested_by = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS extend_discount_insert ON public.extend_stay_discount_requests;
CREATE POLICY extend_discount_insert ON public.extend_stay_discount_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = extend_stay_discount_requests.organization_id
    )
  );

DROP POLICY IF EXISTS extend_discount_update ON public.extend_stay_discount_requests;
CREATE POLICY extend_discount_update ON public.extend_stay_discount_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = extend_stay_discount_requests.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = extend_stay_discount_requests.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager')
    )
  );
