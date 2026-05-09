-- Purchase orders (market / outside purchases) + unlock requests + requisition attachments
-- Run in Supabase SQL Editor after 037_store_requisitions.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Optional attachment (photo of paper form) for requisitions created before this migration
ALTER TABLE public.store_requisitions
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN public.store_requisitions.attachment_url IS 'Optional public/signed URL to uploaded scan or photo.';

CREATE TABLE IF NOT EXISTS public.store_purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date,
  department TEXT NOT NULL,
  delivery_date DATE,
  purchase_request_ref TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'locked', 'cancelled')),
  grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  store_controller_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  store_controller_at TIMESTAMPTZ,
  accountant_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accountant_at TIMESTAMPTZ,
  gm_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gm_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reference)
);

CREATE TABLE IF NOT EXISTS public.store_purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES public.store_purchase_orders(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  ref_note TEXT,
  item_description TEXT NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14, 2) NOT NULL,
  UNIQUE (purchase_order_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.store_document_unlock_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('purchase_order', 'requisition')),
  document_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_po_org ON public.store_purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_po_status ON public.store_purchase_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_store_po_created ON public.store_purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_po_lines ON public.store_purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_store_unlock_org ON public.store_document_unlock_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_unlock_doc ON public.store_document_unlock_requests(document_type, document_id);

ALTER TABLE public.store_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_document_unlock_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_purchase_orders_org ON public.store_purchase_orders;
CREATE POLICY store_purchase_orders_org ON public.store_purchase_orders
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS store_purchase_order_lines_org ON public.store_purchase_order_lines;
CREATE POLICY store_purchase_order_lines_org ON public.store_purchase_order_lines
  FOR ALL TO authenticated
  USING (
    purchase_order_id IN (
      SELECT id FROM public.store_purchase_orders
      WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    purchase_order_id IN (
      SELECT id FROM public.store_purchase_orders
      WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS store_unlock_requests_org ON public.store_document_unlock_requests;
CREATE POLICY store_unlock_requests_org ON public.store_document_unlock_requests
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'store_purchase_orders_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.touch_store_purchase_orders_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    CREATE TRIGGER store_purchase_orders_set_updated_at
      BEFORE UPDATE ON public.store_purchase_orders
      FOR EACH ROW EXECUTE PROCEDURE public.touch_store_purchase_orders_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.store_purchase_orders IS 'Market/outside purchase order; lines locked when status=locked.';
COMMENT ON TABLE public.store_purchase_order_lines IS 'PO line items with qty, unit price, line total.';
COMMENT ON TABLE public.store_document_unlock_requests IS 'Edit-unlock requests for locked PO/requisition (admin approves).';

-- Next step (Supabase Dashboard → Storage): create a bucket named `store-attachments`
-- and set it public (or use signed URLs). The app uploads to paths:
--   {organization_id}/purchase-orders/{po_id}/...
--   {organization_id}/requisitions/{requisition_id}/...
