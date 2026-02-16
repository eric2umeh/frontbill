-- Seed room types
insert into public.room_types (name, base_rate, capacity, amenities) values
  ('Standard', 25000.00, 2, '["WiFi", "AC", "TV"]'::jsonb),
  ('Deluxe', 45000.00, 2, '["WiFi", "AC", "TV", "Mini Bar", "Safe"]'::jsonb),
  ('Suite', 75000.00, 4, '["WiFi", "AC", "TV", "Mini Bar", "Safe", "Living Room", "Jacuzzi"]'::jsonb),
  ('Executive', 100000.00, 2, '["WiFi", "AC", "TV", "Mini Bar", "Safe", "Work Desk", "Lounge Access"]'::jsonb),
  ('Penthouse', 200000.00, 4, '["WiFi", "AC", "TV", "Mini Bar", "Safe", "Living Room", "Kitchen", "Rooftop Access"]'::jsonb)
on conflict do nothing;

-- Seed rooms (20 rooms across 5 floors)
do $$
declare
  rt_standard uuid;
  rt_deluxe uuid;
  rt_suite uuid;
  rt_executive uuid;
  rt_penthouse uuid;
begin
  select id into rt_standard from public.room_types where name = 'Standard' limit 1;
  select id into rt_deluxe from public.room_types where name = 'Deluxe' limit 1;
  select id into rt_suite from public.room_types where name = 'Suite' limit 1;
  select id into rt_executive from public.room_types where name = 'Executive' limit 1;
  select id into rt_penthouse from public.room_types where name = 'Penthouse' limit 1;

  -- Floor 1: Standard rooms
  insert into public.rooms (number, room_type_id, floor, status) values
    ('101', rt_standard, 1, 'available'),
    ('102', rt_standard, 1, 'available'),
    ('103', rt_standard, 1, 'available'),
    ('104', rt_standard, 1, 'available')
  on conflict (number) do nothing;

  -- Floor 2: Deluxe rooms
  insert into public.rooms (number, room_type_id, floor, status) values
    ('201', rt_deluxe, 2, 'available'),
    ('202', rt_deluxe, 2, 'available'),
    ('203', rt_deluxe, 2, 'available'),
    ('204', rt_deluxe, 2, 'available')
  on conflict (number) do nothing;

  -- Floor 3: Deluxe and Suite rooms
  insert into public.rooms (number, room_type_id, floor, status) values
    ('301', rt_deluxe, 3, 'available'),
    ('302', rt_deluxe, 3, 'available'),
    ('303', rt_suite, 3, 'available'),
    ('304', rt_suite, 3, 'available')
  on conflict (number) do nothing;

  -- Floor 4: Executive rooms
  insert into public.rooms (number, room_type_id, floor, status) values
    ('401', rt_executive, 4, 'available'),
    ('402', rt_executive, 4, 'available'),
    ('403', rt_executive, 4, 'available'),
    ('404', rt_executive, 4, 'available')
  on conflict (number) do nothing;

  -- Floor 5: Penthouse and Suite rooms
  insert into public.rooms (number, room_type_id, floor, status) values
    ('501', rt_penthouse, 5, 'available'),
    ('502', rt_penthouse, 5, 'available'),
    ('503', rt_suite, 5, 'available'),
    ('504', rt_suite, 5, 'available')
  on conflict (number) do nothing;
end $$;

-- Seed sample organizations
insert into public.organizations (name, type, contact_person, contact_email, contact_phone, address, credit_limit, payment_terms) values
  ('Ministry of Works', 'government', 'Alhaji Ibrahim', 'ibrahim@gov.ng', '+234-801-234-5678', 'Federal Secretariat, Abuja', 5000000.00, 'Net 60'),
  ('Shell Nigeria', 'private', 'Dr. Adeola Johnson', 'adeola.j@shell.com', '+234-802-345-6789', 'Shell Industrial Area, Port Harcourt', 10000000.00, 'Net 30'),
  ('UNICEF Nigeria', 'ngo', 'Grace Okonkwo', 'g.okonkwo@unicef.org', '+234-803-456-7890', 'UN House, Abuja', 3000000.00, 'Net 45'),
  ('Dangote Industries', 'private', 'Engr. Musa Ahmed', 'musa.a@dangote.com', '+234-804-567-8901', 'Dangote HQ, Lagos', 8000000.00, 'Net 30'),
  ('Red Cross Nigeria', 'ngo', 'Mrs. Fatima Bello', 'f.bello@redcross.ng', '+234-805-678-9012', 'Red Cross Building, Lagos', 2000000.00, 'Net 30')
on conflict do nothing;
