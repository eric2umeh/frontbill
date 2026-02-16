-- City Ledger entries table
create table if not exists public.city_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  booking_id uuid references public.bookings(id),
  amount numeric(12,2) not null,
  type text not null check (type in ('charge', 'payment', 'adjustment')),
  description text,
  reference text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.city_ledger_entries enable row level security;
create policy "city_ledger_select_all" on public.city_ledger_entries for select using (true);
create policy "city_ledger_insert_auth" on public.city_ledger_entries for insert with check (auth.uid() is not null);
