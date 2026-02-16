-- Guests table
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  id_type text,
  id_number text,
  id_verified boolean default false,
  organization_id uuid references public.organizations(id),
  vip boolean default false,
  loyalty_tier text default 'bronze' check (loyalty_tier in ('bronze', 'silver', 'gold', 'platinum')),
  total_stays integer default 0,
  preferences jsonb default '[]'::jsonb,
  special_requests jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.guests enable row level security;
create policy "guests_select_all" on public.guests for select using (true);
create policy "guests_insert_auth" on public.guests for insert with check (auth.uid() is not null);
create policy "guests_update_auth" on public.guests for update using (auth.uid() is not null);
