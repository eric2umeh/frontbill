-- Reconciliations table
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  shift_type text not null check (shift_type in ('morning', 'afternoon', 'night')),
  staff_id uuid not null references public.profiles(id),
  expected_cash numeric(12,2) default 0,
  actual_cash numeric(12,2) default 0,
  discrepancy numeric(12,2) default 0,
  total_transactions integer default 0,
  flagged_transactions integer default 0,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'approved', 'flagged')),
  notes text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.reconciliations enable row level security;
create policy "reconciliations_select_all" on public.reconciliations for select using (true);
create policy "reconciliations_insert_auth" on public.reconciliations for insert with check (auth.uid() is not null);
create policy "reconciliations_update_auth" on public.reconciliations for update using (auth.uid() is not null);

-- Reconciliation flags table
create table if not exists public.reconciliation_flags (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations(id),
  payment_id uuid references public.payments(id),
  flag_type text not null,
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null,
  resolved boolean default false,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.reconciliation_flags enable row level security;
create policy "rec_flags_select_all" on public.reconciliation_flags for select using (true);
create policy "rec_flags_insert_auth" on public.reconciliation_flags for insert with check (auth.uid() is not null);
create policy "rec_flags_update_auth" on public.reconciliation_flags for update using (auth.uid() is not null);
