-- Update schema to align with new menu structure
-- Run after initial schema setup

-- 1. Add guest balance tracking to guests table
alter table public.guests 
add column if not exists current_balance numeric(12,2) default 0,
add column if not exists total_spent numeric(12,2) default 0,
add column if not exists total_bookings integer default 0;

comment on column public.guests.current_balance is 'Positive = guest owes money (debit), Negative = guest has credit';

-- 2. Update organizations table for better city ledger tracking
alter table public.organizations 
alter column current_balance set default 0,
add column if not exists total_transactions numeric(12,2) default 0,
add column if not exists last_transaction_date timestamptz,
add column if not exists notes text;

comment on column public.organizations.current_balance is 'Running balance - amount organization owes hotel';

-- 3. Add transaction tracking fields to payments
alter table public.payments 
add column if not exists transaction_id text unique,
add column if not exists is_city_ledger boolean default false,
add column if not exists applied_to_balance boolean default false;

-- Auto-generate transaction IDs if not present
create or replace function generate_transaction_id()
returns text
language plpgsql
as $$
begin
  return 'TXN' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 10000)::text, 4, '0');
end;
$$;

-- Update existing payments to have transaction IDs
update public.payments 
set transaction_id = generate_transaction_id()
where transaction_id is null;

-- 4. Add reservation date field to bookings
alter table public.bookings 
add column if not exists reservation_date timestamptz default now(),
add column if not exists is_reservation boolean default false,
add column if not exists special_requests text,
add column if not exists room_price_override numeric(12,2);

comment on column public.bookings.is_reservation is 'True if check_in date is in the future';
comment on column public.bookings.room_price_override is 'Custom price if different from standard rate';

-- 5. Update reconciliations table
alter table public.reconciliations 
add column if not exists cash_expected numeric(12,2) default 0,
add column if not exists cash_actual numeric(12,2) default 0,
add column if not exists pos_expected numeric(12,2) default 0,
add column if not exists pos_actual numeric(12,2) default 0,
add column if not exists transfer_expected numeric(12,2) default 0,
add column if not exists transfer_actual numeric(12,2) default 0;

-- 6. Create indexes for better query performance
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_bookings_check_in on public.bookings(check_in);
create index if not exists idx_bookings_is_reservation on public.bookings(is_reservation);
create index if not exists idx_bookings_organization on public.bookings(organization_id);
create index if not exists idx_payments_method on public.payments(method);
create index if not exists idx_payments_is_city_ledger on public.payments(is_city_ledger);
create index if not exists idx_payments_created_at on public.payments(created_at);
create index if not exists idx_guests_current_balance on public.guests(current_balance);
create index if not exists idx_organizations_current_balance on public.organizations(current_balance);

-- 7. Create view for active bookings (not checked out, not cancelled)
create or replace view public.active_bookings as
select 
  b.*,
  g.first_name || ' ' || g.last_name as guest_name,
  g.phone as guest_phone,
  g.email as guest_email,
  r.room_number,
  r.room_type,
  o.name as organization_name
from public.bookings b
join public.guests g on b.guest_id = g.id
join public.rooms r on b.room_id = r.id
left join public.organizations o on b.organization_id = o.id
where b.status in ('reserved', 'checked_in');

-- 8. Create view for future reservations
create or replace view public.future_reservations as
select 
  b.*,
  g.first_name || ' ' || g.last_name as guest_name,
  g.phone as guest_phone,
  r.room_number,
  r.room_type,
  o.name as organization_name
from public.bookings b
join public.guests g on b.guest_id = g.id
join public.rooms r on b.room_id = r.id
left join public.organizations o on b.organization_id = o.id
where b.status = 'reserved' 
  and b.check_in > current_date;

-- 9. Create view for all transactions (payments)
create or replace view public.all_transactions as
select 
  p.id,
  p.transaction_id,
  p.created_at as transaction_date,
  p.amount,
  p.method as payment_method,
  p.payer_type,
  p.payer_name,
  p.is_city_ledger,
  g.first_name || ' ' || g.last_name as guest_name,
  o.name as organization_name,
  b.check_in,
  b.check_out,
  r.room_number,
  prof.first_name || ' ' || prof.last_name as recorded_by_name
from public.payments p
join public.guests g on p.guest_id = g.id
join public.bookings b on p.booking_id = b.id
join public.rooms r on b.room_id = r.id
left join public.organizations o on p.organization_id = o.id
join public.profiles prof on p.recorded_by = prof.id
where p.voided = false
order by p.created_at desc;

-- 10. Create function to update guest balance
create or replace function update_guest_balance()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- Update guest balance when payment is made
    if new.is_city_ledger = false then
      -- Direct payment reduces balance
      update public.guests
      set current_balance = current_balance - new.amount,
          total_spent = total_spent + new.amount
      where id = new.guest_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_update_guest_balance on public.payments;
create trigger trigger_update_guest_balance
  after insert on public.payments
  for each row
  execute function update_guest_balance();

-- 11. Create function to update organization balance
create or replace function update_organization_balance()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- Update organization balance for city ledger transactions
    if new.is_city_ledger = true and new.organization_id is not null then
      update public.organizations
      set current_balance = current_balance + new.amount,
          total_transactions = total_transactions + new.amount,
          last_transaction_date = new.created_at
      where id = new.organization_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_update_organization_balance on public.payments;
create trigger trigger_update_organization_balance
  after insert on public.payments
  for each row
  execute function update_organization_balance();

-- 12. Create function to update booking balance
create or replace function update_booking_balance()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- Update booking paid amount and balance
    update public.bookings
    set paid_amount = paid_amount + new.amount,
        balance = total_amount - (paid_amount + new.amount),
        payment_status = case
          when (paid_amount + new.amount) >= total_amount then 'paid'
          when (paid_amount + new.amount) > 0 then 'partial'
          else 'pending'
        end
    where id = new.booking_id;
    
    -- Update guest total bookings count
    update public.guests
    set total_bookings = (
      select count(*) from public.bookings 
      where guest_id = new.guest_id
    )
    where id = new.guest_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_update_booking_balance on public.payments;
create trigger trigger_update_booking_balance
  after insert on public.payments
  for each row
  execute function update_booking_balance();

-- 13. Grant permissions
grant select on public.active_bookings to authenticated;
grant select on public.future_reservations to authenticated;
grant select on public.all_transactions to authenticated;
