-- Activities table (audit trail)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  guest_id uuid references public.guests(id),
  type text not null,
  sub_type text,
  description text not null,
  details text,
  amount numeric(12,2) default 0,
  balance_after numeric(12,2) default 0,
  performed_by uuid references public.profiles(id),
  department text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.activities enable row level security;
create policy "activities_select_all" on public.activities for select using (true);
create policy "activities_insert_auth" on public.activities for insert with check (auth.uid() is not null);
