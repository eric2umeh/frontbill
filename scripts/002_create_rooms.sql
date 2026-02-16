-- Room types table
create table if not exists public.room_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_rate numeric(12,2) not null default 0,
  capacity integer not null default 2,
  amenities jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.room_types enable row level security;
create policy "room_types_select_all" on public.room_types for select using (true);
create policy "room_types_insert_auth" on public.room_types for insert with check (auth.uid() is not null);
create policy "room_types_update_auth" on public.room_types for update using (auth.uid() is not null);

-- Rooms table
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  room_type_id uuid references public.room_types(id),
  floor integer not null default 1,
  status text not null default 'available' check (status in ('available', 'occupied', 'cleaning', 'maintenance', 'reserved')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.rooms enable row level security;
create policy "rooms_select_all" on public.rooms for select using (true);
create policy "rooms_insert_auth" on public.rooms for insert with check (auth.uid() is not null);
create policy "rooms_update_auth" on public.rooms for update using (auth.uid() is not null);
create policy "rooms_delete_auth" on public.rooms for delete using (auth.uid() is not null);
