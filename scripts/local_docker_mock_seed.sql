-- Local Docker mock data for "Test Hotel" (local@dev.com).
-- No app code — SQL only. Safe-ish to re-run (upserts / fixed keys).
-- Does NOT import staging Auth. Do not restore auth from develop.

DO $$
DECLARE
  org_id UUID := '855cf730-4bba-48e1-bbcf-26598419f88c';
  user_id UUID := 'd5d1c584-1c65-4ff1-bb8d-912032303479';
  room101 UUID;
  room102 UUID;
  room201 UUID;
  room301 UUID;
  guest1 UUID := 'b1111111-1111-4111-8111-111111111111';
  guest2 UUID := 'b2222222-2222-4222-8222-222222222222';
  guest3 UUID := 'b3333333-3333-4333-8333-333333333333';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id) THEN
    RAISE EXCEPTION 'Test Hotel org % not found — sign in as local@dev.com first', org_id;
  END IF;

  INSERT INTO public.rooms (organization_id, room_number, floor_number, room_type, status, price_per_night, max_occupancy, amenities)
  VALUES
    (org_id, '101', 1, 'Standard', 'available', 25000, 2, ARRAY['AC','WiFi','TV']),
    (org_id, '102', 1, 'Standard', 'occupied', 25000, 2, ARRAY['AC','WiFi','TV']),
    (org_id, '201', 2, 'Deluxe', 'available', 45000, 3, ARRAY['AC','WiFi','TV','Mini bar']),
    (org_id, '301', 3, 'Suite', 'available', 85000, 4, ARRAY['AC','WiFi','TV','Mini bar','Jacuzzi'])
  ON CONFLICT (organization_id, room_number) DO UPDATE SET
    room_type = EXCLUDED.room_type,
    price_per_night = EXCLUDED.price_per_night,
    status = EXCLUDED.status,
    amenities = EXCLUDED.amenities;

  SELECT id INTO room101 FROM public.rooms WHERE organization_id = org_id AND room_number = '101';
  SELECT id INTO room102 FROM public.rooms WHERE organization_id = org_id AND room_number = '102';
  SELECT id INTO room201 FROM public.rooms WHERE organization_id = org_id AND room_number = '201';
  SELECT id INTO room301 FROM public.rooms WHERE organization_id = org_id AND room_number = '301';

  INSERT INTO public.guests (id, organization_id, name, email, phone, city, country, notes)
  VALUES
    (guest1, org_id, 'Ada Okonkwo', 'ada.okonkwo@example.com', '+2348011111111', 'Lagos', 'Nigeria', 'Mock guest'),
    (guest2, org_id, 'Chidi Eze', 'chidi.eze@example.com', '+2348022222222', 'Abuja', 'Nigeria', 'Mock guest'),
    (guest3, org_id, 'Ngozi Bello', 'ngozi.bello@example.com', '+2348033333333', 'Port Harcourt', 'Nigeria', 'Corporate')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone;

  INSERT INTO public.bookings (
    organization_id, guest_id, room_id, folio_id,
    check_in, check_out, number_of_nights, rate_per_night, total_amount,
    deposit, balance, payment_status, status, notes, created_by
  )
  VALUES (
    org_id, guest1, room102, 'FOLIO-MOCK-001',
    CURRENT_DATE - 1, CURRENT_DATE + 2, 3, 25000, 75000,
    30000, 45000, 'partial', 'checked_in', 'Local mock stay', user_id
  )
  ON CONFLICT (folio_id) DO NOTHING;

  INSERT INTO public.bookings (
    organization_id, guest_id, room_id, folio_id,
    check_in, check_out, number_of_nights, rate_per_night, total_amount,
    deposit, balance, payment_status, status, notes, created_by
  )
  VALUES (
    org_id, guest2, room201, 'FOLIO-MOCK-002',
    CURRENT_DATE + 3, CURRENT_DATE + 5, 2, 45000, 90000,
    20000, 70000, 'partial', 'reserved', 'Local mock reservation', user_id
  )
  ON CONFLICT (folio_id) DO NOTHING;

  INSERT INTO public.supply_catalog_items (
    id, organization_id, name, unit, dept, depts,
    quantity_in_store, reorder_level, last_price, benchmark_price, kitchen_category, created_by
  )
  VALUES
    ('mock-rice-50kg', org_id, 'Rice (50kg bag)', 'bag', 'kitchen', ARRAY['kitchen','store'], 12, 3, 45000, 42000, 'dry_goods', user_id),
    ('mock-chicken', org_id, 'Chicken (whole)', 'kg', 'kitchen', ARRAY['kitchen'], 40, 10, 3200, 3000, 'protein', user_id),
    ('mock-oil', org_id, 'Vegetable oil', 'litre', 'kitchen', ARRAY['kitchen','store'], 25, 5, 1800, 1700, 'dry_goods', user_id),
    ('mock-beer', org_id, 'Lager beer (crate)', 'crate', 'bar', ARRAY['bar','store'], 18, 4, 8500, 8000, NULL, user_id),
    ('mock-soft-drink', org_id, 'Soft drinks (crate)', 'crate', 'bar', ARRAY['bar'], 22, 6, 4500, 4200, NULL, user_id),
    ('mock-detergent', org_id, 'Laundry detergent', 'kg', 'housekeeping', ARRAY['housekeeping','store'], 15, 4, 2500, 2300, NULL, user_id)
  ON CONFLICT (id) DO UPDATE SET
    quantity_in_store = EXCLUDED.quantity_in_store,
    last_price = EXCLUDED.last_price,
    updated_at = now();

  INSERT INTO public.supply_chain_snapshots (organization_id, snapshot_key, data)
  VALUES
    (org_id, 'kitchen_stock', '[]'::jsonb),
    (org_id, 'bar_stock', '[]'::jsonb),
    (org_id, 'issue_out_log', '[]'::jsonb),
    (org_id, 'purchase_orders', '[]'::jsonb),
    (org_id, 'basket', '[]'::jsonb),
    (org_id, 'activity_log', '[]'::jsonb)
  ON CONFLICT (organization_id, snapshot_key) DO NOTHING;

  RAISE NOTICE 'Mock seed OK for Test Hotel (rooms %, %, %, %)', room101, room102, room201, room301;
END $$;
