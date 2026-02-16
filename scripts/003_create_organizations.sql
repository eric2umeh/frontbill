-- Organizations table
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'private' check (type in ('government', 'ngo', 'private')),
  contact_person text,
  contact_email text,
  contact_phone text,
  address text,
  credit_limit numeric(12,2) default 0,
  current_balance numeric(12,2) default 0,
  payment_terms text default 'Net 30',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.organizations enable row level security;
create policy "organizations_select_all" on public.organizations for select using (true);
create policy "organizations_insert_auth" on public.organizations for insert with check (auth.uid() is not null);
create policy "organizations_update_auth" on public.organizations for update using (auth.uid() is not null);
