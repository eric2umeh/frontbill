-- Payments table (APPEND-ONLY - immutable ledger)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  guest_id uuid not null references public.guests(id),
  organization_id uuid references public.organizations(id),
  amount numeric(12,2) not null,
  method text not null check (method in ('cash', 'pos', 'transfer', 'corporate_account')),
  payer_type text not null default 'individual' check (payer_type in ('individual', 'corporate', 'government', 'ngo')),
  payer_name text,
  reference text,
  notes text,
  recorded_by uuid not null references public.profiles(id),
  voided boolean default false,
  void_reason text,
  voided_by uuid references public.profiles(id),
  reconciliation_id uuid,
  transparency_score integer default 100,
  created_at timestamptz default now()
);

alter table public.payments enable row level security;
-- IMMUTABLE: Only INSERT and SELECT policies (no update/delete)
create policy "payments_select_all" on public.payments for select using (true);
create policy "payments_insert_auth" on public.payments for insert with check (auth.uid() is not null);
