-- Optional delivery / tray charge on room-service outlet orders
ALTER TABLE public.outlet_orders
  ADD COLUMN IF NOT EXISTS room_service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (room_service_fee >= 0);

COMMENT ON COLUMN public.outlet_orders.room_service_fee IS
  'Optional charge for delivering order to guest room (room_service order type). Included in subtotal.';
