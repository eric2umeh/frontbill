-- Bookings table
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id),
  room_id uuid not null references public.rooms(id),
  organization_id uuid references public.organizations(id),
  check_in date not null,
  check_out date not null,
  nights integer not null default 1,
  rate_per_night numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  paid_amount numeric(12,2) default 0,
  balance numeric(12,2) not null,
  status text not null default 'reserved' check (status in ('reserved', 'checked_in', 'checked_out', 'no_show', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('paid', 'partial', 'pending', 'arrears')),
  guest_type text not null default 'walkin' check (guest_type in ('walkin', 'reservation', 'organization')),
  extended boolean default false,
  original_checkout date,
  created_by uuid references public.profiles(id),
  checked_in_by uuid references public.profiles(id),
  checked_out_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bookings enable row level security;
create policy "bookings_select_all" on public.bookings for select using (true);
create policy "bookings_insert_auth" on public.bookings for insert with check (auth.uid() is not null);
create policy "bookings_update_auth" on public.bookings for update using (auth.uid() is not null);
