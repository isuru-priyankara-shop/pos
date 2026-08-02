-- =============================================================
-- 00001_schema.sql
-- Core schema: tables, guard triggers, helper functions
-- Roles: admin, manager, cashier (stored on profiles)
-- =============================================================

-- ------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'cashier' check (role in ('admin', 'manager', 'cashier')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Catalog
-- ------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories(id),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku_prefix text,
  category_id uuid references public.categories(id),
  description text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- stock_qty is ALWAYS mutated by the inventory_transactions trigger,
-- never by direct UPDATEs (see guard trigger below).
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  color text,
  barcode text unique not null,
  price numeric(10,2) not null check (price >= 0),
  cost_price numeric(10,2) check (cost_price >= 0),
  stock_qty integer not null default 0,
  reorder_level integer not null default 5,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Customers & loyalty
-- ------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  loyalty_points integer not null default 0,
  credit_balance numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  points integer not null,
  type text not null check (type in ('earn','redeem','adjust')),
  reference_id uuid,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Sales (client-generated UUIDs for offline idempotency)
-- ------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key, -- client-generated, never serial
  customer_id uuid references public.customers(id),
  cashier_id uuid not null references public.profiles(id),
  sale_date timestamptz not null default now(),
  subtotal numeric(10,2) not null,
  discount_total numeric(10,2) not null default 0,
  tax_total numeric(10,2) not null default 0,
  grand_total numeric(10,2) not null,
  status text not null default 'completed' check (status in ('completed','refunded','void')),
  created_offline boolean not null default false,
  synced_at timestamptz
);

create table if not exists public.sale_items (
  id uuid primary key, -- client-generated for offline idempotency
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  line_discount numeric(10,2) not null default 0,
  line_total numeric(10,2) not null
);

create table if not exists public.payments (
  id uuid primary key, -- client-generated for offline idempotency
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash','card','qr','credit')),
  amount numeric(10,2) not null check (amount > 0),
  transaction_ref text,
  status text not null default 'success' check (status in ('success','pending_capture','failed','refunded'))
);

-- ------------------------------------------------------------------
-- Inventory audit trail
--   type 'sale'      -> quantity positive units sold, stock DECREASES
--   type 'restock'   -> quantity positive, stock INCREASES
--   type 'return'    -> quantity positive, stock INCREASES
--   type 'adjustment'-> quantity is the ABSOLUTE new stock level
-- ------------------------------------------------------------------
create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id),
  type text not null check (type in ('restock','sale','adjustment','return')),
  quantity integer not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

-- Oversold / offline stock conflict flags (manager review queue)
create table if not exists public.stock_conflicts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id),
  variant_id uuid not null references public.product_variants(id),
  requested_quantity integer not null,
  available_quantity integer not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Suppliers & purchasing
-- ------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id),
  status text not null default 'pending' check (status in ('pending','received','cancelled')),
  order_date date not null default current_date,
  received_date date
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  cost_price numeric(10,2)
);

-- ------------------------------------------------------------------
-- App settings (void threshold etc.) - key/value, admin-managed
-- ------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ==================================================================
-- Helpers & triggers
-- ==================================================================

-- Current role of the authenticated user (security definer: bypasses RLS
-- so it can be used inside policies without recursion).
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Updated-at bookkeeping
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- INVENTORY GUARD: the only legal way to change stock_qty is through
-- inventory_transactions. A direct UPDATE on stock_qty raises.
-- The apply_inventory_transaction() trigger sets a transaction-local
-- GUC flag so its own internal UPDATE passes the guard.
-- ------------------------------------------------------------------
create or replace function public.guard_stock_qty()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.allow_stock_update', true), '') <> 't' then
    raise exception 'Direct stock_qty update is not allowed. Insert into inventory_transactions instead (variant %)', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_stock_qty on public.product_variants;
create trigger trg_guard_stock_qty
  before update of stock_qty on public.product_variants
  for each row
  execute function public.guard_stock_qty();

-- Applies an inventory_transactions row to the variant's stock.
-- Runs in the same statement/transaction as the INSERT, so a failed
-- insert never changes stock (atomicity).
create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer;
begin
  perform set_config('app.allow_stock_update', 't', true);

  case new.type
    when 'adjustment' then
      update public.product_variants
        set stock_qty = new.quantity
      where id = new.variant_id;
    when 'sale' then
      update public.product_variants
        set stock_qty = stock_qty - abs(new.quantity)
      where id = new.variant_id;
    when 'restock', 'return' then
      update public.product_variants
        set stock_qty = stock_qty + abs(new.quantity)
      where id = new.variant_id;
    else
      raise exception 'Unknown inventory transaction type: %', new.type;
  end case;

  perform set_config('app.allow_stock_update', '', true);
  return new;
end;
$$;

drop trigger if exists trg_apply_inventory_transaction on public.inventory_transactions;
create trigger trg_apply_inventory_transaction
  after insert on public.inventory_transactions
  for each row
  execute function public.apply_inventory_transaction();

-- ------------------------------------------------------------------
-- Auto-create a profile on auth signup.
-- Default role: 'cashier', is_active: false -> admin must activate.
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'cashier', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ------------------------------------------------------------------
-- Default settings
-- ------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('void_threshold', '0') -- amounts above this need manager approval
on conflict (key) do nothing;
