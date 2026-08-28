-- Staff app usage signals (install, home-screen opens, daily sign-in).
-- Run on staging first, then prod after deploy.

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signal_type text NOT NULL,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_logs_signal_type_check CHECK (
    signal_type IN (
      'app_installed',
      'standalone_open',
      'daily_sign_in',
      'first_open',
      'return_open'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_org_created
  ON public.usage_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_org_signal_created
  ON public.usage_logs (organization_id, signal_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created
  ON public.usage_logs (user_id, created_at DESC);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view usage logs" ON public.usage_logs;
CREATE POLICY "Org members can view usage logs" ON public.usage_logs
  FOR SELECT USING (organization_id = public.current_user_org_id());

-- Inserts via /api/usage-logs (service role).

COMMENT ON TABLE public.usage_logs IS
  'FrontBill staff app usage: install, standalone mode, and sign-in activity per hotel.';
