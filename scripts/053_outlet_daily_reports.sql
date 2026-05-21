-- Outlet daily closing reports (per department / business day)
-- Run in Supabase SQL Editor after 052_outlet_room_service_fee.sql

CREATE TABLE IF NOT EXISTS public.outlet_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  report_date DATE NOT NULL,
  order_count INT NOT NULL DEFAULT 0,
  void_count INT NOT NULL DEFAULT 0,
  gross_sales NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (gross_sales >= 0),
  payment_breakdown JSONB NOT NULL DEFAULT '{}',
  top_items JSONB NOT NULL DEFAULT '[]',
  summary JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, department, report_date)
);

CREATE INDEX IF NOT EXISTS idx_outlet_daily_reports_org_dept_date
  ON public.outlet_daily_reports(organization_id, department, report_date DESC);

ALTER TABLE public.outlet_daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_daily_reports_org ON public.outlet_daily_reports;
CREATE POLICY outlet_daily_reports_org ON public.outlet_daily_reports
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_daily_reports.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = outlet_daily_reports.organization_id
    )
  );
