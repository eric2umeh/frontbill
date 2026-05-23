-- Walk-in order type + optional waiter on outlet orders

ALTER TABLE public.outlet_orders
  DROP CONSTRAINT IF EXISTS outlet_orders_order_type_check;

ALTER TABLE public.outlet_orders
  ADD CONSTRAINT outlet_orders_order_type_check
  CHECK (order_type IN ('dine_in', 'takeaway', 'room_service', 'walk_in'));

ALTER TABLE public.outlet_orders
  ADD COLUMN IF NOT EXISTS waiter_name TEXT,
  ADD COLUMN IF NOT EXISTS waiter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.outlet_orders.waiter_name IS 'Optional waiter/server name on printed bill';
COMMENT ON COLUMN public.outlet_orders.waiter_id IS 'Optional link to staff profile when picked from search';
