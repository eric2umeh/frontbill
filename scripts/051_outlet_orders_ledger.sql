-- Link outlet orders to city ledger account when settled on city ledger
ALTER TABLE public.outlet_orders
  ADD COLUMN IF NOT EXISTS city_ledger_account_id UUID REFERENCES public.city_ledger_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outlet_orders_ledger
  ON public.outlet_orders(city_ledger_account_id);
