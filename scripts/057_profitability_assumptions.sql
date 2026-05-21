-- Saved assumptions for Analytics → Profitability (unit economics)
-- Run in Supabase SQL Editor after 044_hotel_expenses.sql

CREATE TABLE IF NOT EXISTS public.profitability_assumptions (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profitability_assumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profitability_assumptions_org ON public.profitability_assumptions;
CREATE POLICY profitability_assumptions_org ON public.profitability_assumptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = profitability_assumptions.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = profitability_assumptions.organization_id
    )
  );
