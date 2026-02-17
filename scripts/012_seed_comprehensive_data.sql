-- Comprehensive seed data for FrontBill
-- This creates realistic test data matching the mock data in the UI

-- 1. Seed Organizations with zero balance
insert into public.organizations (name, type, contact_person, contact_email, contact_phone, credit_limit, current_balance, is_active) values
('Federal Ministry of Health', 'government', 'Dr. Adewale Johnson', 'adewale@health.gov.ng', '+234 803 456 7890', 5000000, 0, true),
('Shell Nigeria Ltd', 'private', 'Mrs. Fatima Bello', 'fatima.bello@shell.com.ng', '+234 805 234 5678', 10000000, 0, true),
('United Nations Development Programme', 'ngo', 'Mr. John Smith', 'john.smith@undp.org', '+234 802 345 6789', 8000000, 0, true),
('Lagos State Government', 'government', 'Hon. Ngozi Okonjo', 'ngozi@lagosstate.gov.ng', '+234 806 789 0123', 7000000, 0, true),
('TotalEnergies Nigeria', 'private', 'Mr. Pierre Dubois', 'pierre.dubois@totalenergies.com', '+234 807 890 1234', 9000000, 0, true),
('Red Cross Nigeria', 'ngo', 'Mrs. Aisha Mohammed', 'aisha@redcross.org.ng', '+234 808 901 2345', 3000000, 0, true),
('Dangote Group', 'private', 'Alhaji Sani Dangote', 'sani@dangote.com', '+234 809 012 3456', 15000000, 0, true),
('World Health Organization', 'ngo', 'Dr. Sarah Williams', 'sarah.williams@who.int', '+234 810 123 4567', 6000000, 0, true)
on conflict do nothing;

-- 2. Seed Guests (50+ guests with realistic Nigerian names)
insert into public.guests (first_name, last_name, phone, email, address, organization_id, current_balance) values
('Adewale', 'Johnson', '+234 803 123 4567', 'adewale.johnson@email.com', '12 Victoria Island, Lagos', null, 0),
('Fatima', 'Bello', '+234 805 234 5678', 'fatima.bello@email.com', '45 GRA, Abuja', (select id from public.organizations where name = 'Shell Nigeria Ltd'), 0),
('Emeka', 'Okafor', '+234 807 345 6789', 'emeka.okafor@email.com', '23 Enugu Road, Onitsha', null, 0),
('Ngozi', 'Adeyemi', '+234 808 456 7890', 'ngozi.adeyemi@email.com', '67 Ikoyi, Lagos', null, 0),
('Ibrahim', 'Mohammed', '+234 809 567 8901', 'ibrahim.mohammed@email.com', '89 Kano', null, 0),
('Chioma', 'Nwosu', '+234 810 678 9012', 'chioma.nwosu@email.com', '34 Port Harcourt', null, 0),
('Yusuf', 'Abdullahi', '+234 811 789 0123', 'yusuf.abdullahi@email.com', '56 Kaduna', null, 0),
('Aisha', 'Suleiman', '+234 812 890 1234', 'aisha.suleiman@email.com', '78 Maiduguri', (select id from public.organizations where name = 'Federal Ministry of Health'), 0),
('Oluwatobi', 'Adewunmi', '+234 813 901 2345', 'oluwatobi.adewunmi@email.com', '90 Ibadan', null, 0),
('Kemi', 'Adekunle', '+234 814 012 3456', 'kemi.adekunle@email.com', '12 Abeokuta', null, 0),
('Chukwuemeka', 'Okoro', '+234 815 123 4567', 'chukwu.okoro@email.com', '34 Owerri', null, 0),
('Halima', 'Bala', '+234 816 234 5678', 'halima.bala@email.com', '56 Sokoto', null, 0),
('Oluwaseun', 'Oyedepo', '+234 817 345 6789', 'oluwaseun.oyedepo@email.com', '78 Ota', null, 0),
('Amina', 'Tijani', '+234 818 456 7890', 'amina.tijani@email.com', '90 Jos', null, 0),
('Babatunde', 'Fashola', '+234 819 567 8901', 'babatunde.fashola@email.com', '12 Ikeja', null, 0),
('Zainab', 'Hassan', '+234 820 678 9012', 'zainab.hassan@email.com', '34 Bauchi', null, 0),
('Chinedu', 'Achebe', '+234 821 789 0123', 'chinedu.achebe@email.com', '56 Nsukka', null, 0),
('Hauwa', 'Garba', '+234 822 890 1234', 'hauwa.garba@email.com', '78 Gombe', null, 0),
('Olumide', 'Williams', '+234 823 901 2345', 'olumide.williams@email.com', '90 Surulere', null, 0),
('Blessing', 'Okeke', '+234 824 012 3456', 'blessing.okeke@email.com', '12 Aba', null, 0)
on conflict do nothing;

-- 3. Seed sample bookings (mix of active, reservations, checked out)
do $$
declare
  guest_rec record;
  room_rec record;
  booking_id uuid;
  org_id uuid;
begin
  -- Get some guests and rooms
  for guest_rec in (select id from public.guests limit 10) loop
    for room_rec in (select id, rate_per_night from public.rooms where status = 'available' limit 1) loop
      
      -- Create active booking (checked in)
      insert into public.bookings (
        guest_id, room_id, check_in, check_out, nights, 
        rate_per_night, total_amount, balance, 
        status, payment_status, guest_type
      ) values (
        guest_rec.id, 
        room_rec.id, 
        current_date - interval '2 days', 
        current_date + interval '3 days', 
        5,
        room_rec.rate_per_night,
        room_rec.rate_per_night * 5,
        room_rec.rate_per_night * 5,
        'checked_in',
        'pending',
        'walkin'
      ) returning id into booking_id;
      
      -- Mark room as occupied
      update public.rooms set status = 'occupied' where id = room_rec.id;
      
      exit; -- One room per guest
    end loop;
  end loop;
  
  -- Create future reservations
  for guest_rec in (select id from public.guests offset 10 limit 5) loop
    for room_rec in (select id, rate_per_night from public.rooms where status = 'available' limit 1) loop
      
      insert into public.bookings (
        guest_id, room_id, check_in, check_out, nights, 
        rate_per_night, total_amount, balance, 
        status, payment_status, guest_type, is_reservation
      ) values (
        guest_rec.id, 
        room_rec.id, 
        current_date + interval '5 days', 
        current_date + interval '8 days', 
        3,
        room_rec.rate_per_night,
        room_rec.rate_per_night * 3,
        room_rec.rate_per_night * 3,
        'reserved',
        'pending',
        'reservation',
        true
      ) returning id into booking_id;
      
      -- Mark room as reserved
      update public.rooms set status = 'reserved' where id = room_rec.id;
      
      exit;
    end loop;
  end loop;
end $$;

-- 4. Seed sample payments for active bookings
do $$
declare
  booking_rec record;
  staff_id uuid;
begin
  -- Get first staff member
  select id into staff_id from public.profiles limit 1;
  
  -- Create payments for some bookings
  for booking_rec in (
    select id, guest_id, organization_id, total_amount 
    from public.bookings 
    where status = 'checked_in' 
    limit 5
  ) loop
    
    -- Create partial payment
    insert into public.payments (
      booking_id, guest_id, organization_id, amount, 
      method, payer_type, payer_name, 
      transaction_id, is_city_ledger, recorded_by
    ) values (
      booking_rec.id,
      booking_rec.guest_id,
      booking_rec.organization_id,
      booking_rec.total_amount * 0.5, -- 50% payment
      case (random() * 3)::int
        when 0 then 'cash'
        when 1 then 'pos'
        when 2 then 'transfer'
        else 'cash'
      end,
      case 
        when booking_rec.organization_id is not null then 'corporate'
        else 'individual'
      end,
      'Partial Payment',
      'TXN' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0'),
      false,
      staff_id
    );
    
  end loop;
end $$;

-- 5. Seed sample reconciliations
do $$
declare
  staff_id uuid;
begin
  select id into staff_id from public.profiles limit 1;
  
  insert into public.reconciliations (
    shift_date, shift_type, status, 
    total_expected, total_actual, variance,
    cash_expected, cash_actual,
    pos_expected, pos_actual,
    transfer_expected, transfer_actual,
    reconciled_by
  ) values
  (current_date - interval '1 day', 'morning', 'approved', 450000, 450000, 0, 200000, 200000, 150000, 150000, 100000, 100000, staff_id),
  (current_date - interval '1 day', 'afternoon', 'approved', 380000, 380000, 0, 150000, 150000, 130000, 130000, 100000, 100000, staff_id),
  (current_date - interval '1 day', 'night', 'flagged', 220000, 215000, -5000, 100000, 95000, 70000, 70000, 50000, 50000, staff_id),
  (current_date, 'morning', 'pending', 420000, 420000, 0, 180000, 180000, 140000, 140000, 100000, 100000, null)
  on conflict do nothing;
end $$;

-- 6. Create activity log entries
do $$
declare
  staff_id uuid;
  guest_id uuid;
  booking_id uuid;
begin
  select id into staff_id from public.profiles limit 1;
  select id into guest_id from public.guests limit 1;
  select id into booking_id from public.bookings limit 1;
  
  insert into public.activities (
    activity_type, entity_type, entity_id, 
    description, performed_by
  ) values
  ('create', 'booking', booking_id, 'New booking created for guest', staff_id),
  ('update', 'booking', booking_id, 'Guest checked in', staff_id),
  ('create', 'payment', null, 'Payment received - Cash', staff_id),
  ('create', 'guest', guest_id, 'New guest registered', staff_id)
  on conflict do nothing;
end $$;
