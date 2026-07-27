-- ============================================================
-- FW Footwear Billing - Supabase schema
-- Paste this whole file into: Supabase Dashboard > SQL Editor > New query > Run
-- It is safe to re-run (idempotent).
-- ============================================================

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'cashier' check (role in ('admin','cashier')),
  created_at timestamptz default now()
);

create table if not exists public.settings (
  id int primary key default 1,
  shop text default 'FW',
  owner_phone text,
  cost_code text default 'VCIFTORLHM',
  owner_copy boolean default true,
  auto_lock_min int default 5,
  constraint settings_singleton check (id = 1)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  model text,
  size text,
  color text,
  price numeric not null default 0,
  qty int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cost lives in its OWN table so billing staff can never read it.
create table if not exists public.item_costs (
  item_id uuid primary key references public.items on delete cascade,
  cost numeric not null default 0
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  customer_name text,
  customer_phone text,
  created_by uuid default auth.uid()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales on delete cascade,
  item_id uuid,
  name text, brand text, model text, size text, color text,
  price numeric, qty int, line_total numeric
);

-- Cost & profit of each bill - admin only.
create table if not exists public.sale_finance (
  sale_id uuid primary key references public.sales on delete cascade,
  cost numeric default 0,
  profit numeric default 0
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- Helper: is the current user an admin? ----------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ---------- Auto-create a profile (role=cashier) on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role) values (new.id, 'cashier')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles     enable row level security;
alter table public.settings     enable row level security;
alter table public.items        enable row level security;
alter table public.item_costs   enable row level security;
alter table public.sales        enable row level security;
alter table public.sale_items   enable row level security;
alter table public.sale_finance enable row level security;

-- profiles: you can read your own row; admin reads all; admin can change roles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- settings: everyone signed in reads; only admin writes
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select
  using (auth.uid() is not null);
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- items: everyone signed in reads; only admin writes
drop policy if exists items_select on public.items;
create policy items_select on public.items for select
  using (auth.uid() is not null);
drop policy if exists items_write on public.items;
create policy items_write on public.items for all
  using (public.is_admin()) with check (public.is_admin());

-- item_costs: ADMIN ONLY (billing staff cannot even read costs)
drop policy if exists item_costs_admin on public.item_costs;
create policy item_costs_admin on public.item_costs for all
  using (public.is_admin()) with check (public.is_admin());

-- sales: admin reads all; a cashier reads only bills they created
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select
  using (public.is_admin() or created_by = auth.uid());

-- sale_items: follows sales visibility
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select
  using (public.is_admin() or exists (
    select 1 from public.sales s where s.id = sale_id and s.created_by = auth.uid()
  ));

-- sale_finance: ADMIN ONLY (profit/cost hidden from billing staff)
drop policy if exists sale_finance_admin on public.sale_finance;
create policy sale_finance_admin on public.sale_finance for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Secure checkout RPC ----------
-- Billing staff call this ONE function to record a sale. It runs with
-- elevated rights (security definer) so it can read costs + reduce stock,
-- while the caller never gets direct access to costs.
create or replace function public.record_sale(
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid;
  v_cost numeric := 0;
  it jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.sales (subtotal, discount, total, customer_name, customer_phone, created_by)
  values (p_subtotal, p_discount, p_total, p_customer_name, p_customer_phone, auth.uid())
  returning id into v_sale_id;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.sale_items (sale_id, item_id, name, brand, model, size, color, price, qty, line_total)
    values (
      v_sale_id,
      (it->>'item_id')::uuid,
      it->>'name', it->>'brand', it->>'model', it->>'size', it->>'color',
      (it->>'price')::numeric, (it->>'qty')::int, (it->>'line_total')::numeric
    );

    update public.items
      set qty = greatest(0, qty - (it->>'qty')::int), updated_at = now()
      where id = (it->>'item_id')::uuid;

    v_cost := v_cost + coalesce(
      (select c.cost from public.item_costs c where c.item_id = (it->>'item_id')::uuid), 0
    ) * (it->>'qty')::int;
  end loop;

  insert into public.sale_finance (sale_id, cost, profit)
  values (v_sale_id, v_cost, p_total - v_cost);

  return v_sale_id;
end $$;

grant execute on function public.record_sale(numeric, numeric, numeric, text, text, jsonb) to authenticated;

-- Keep updated_at fresh on item edits
create or replace function public.touch_items() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute procedure public.touch_items();
