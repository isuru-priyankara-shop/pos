-- =============================================================
-- 00002_rls.sql
-- Row Level Security per role: admin > manager > cashier
-- Roles resolved via profiles.role (security definer helper).
-- =============================================================

alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_variants    enable row level security;
alter table public.customers           enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.payments            enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.stock_conflicts     enable row level security;
alter table public.suppliers           enable row level security;
alter table public.purchase_orders     enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.app_settings        enable row level security;

-- ------------------------------------------------------------------
-- profiles: self-view for everyone; full access for admin only
-- (profile rows are also auto-created by the signup trigger)
-- ------------------------------------------------------------------
create policy "profiles self select" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_role() = 'admin');

create policy "profiles admin all" on public.profiles
  for all to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ------------------------------------------------------------------
-- categories: read for all, write for manager+
-- ------------------------------------------------------------------
create policy "categories read" on public.categories
  for select to authenticated using (true);

create policy "categories manager write" on public.categories
  for insert to authenticated with check (public.current_role() in ('admin','manager'));

create policy "categories manager update" on public.categories
  for update to authenticated using (public.current_role() in ('admin','manager'));

create policy "categories manager delete" on public.categories
  for delete to authenticated using (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- products: read for all, write for manager+
-- ------------------------------------------------------------------
create policy "products read" on public.products
  for select to authenticated using (true);

create policy "products manager insert" on public.products
  for insert to authenticated with check (public.current_role() in ('admin','manager'));

create policy "products manager update" on public.products
  for update to authenticated using (public.current_role() in ('admin','manager'));

create policy "products manager delete" on public.products
  for delete to authenticated using (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- product_variants: read for all, write for manager+
-- (stock_qty writes are still gated by the inventory trigger)
-- ------------------------------------------------------------------
create policy "variants read" on public.product_variants
  for select to authenticated using (true);

create policy "variants manager insert" on public.product_variants
  for insert to authenticated with check (public.current_role() in ('admin','manager'));

create policy "variants manager update" on public.product_variants
  for update to authenticated using (public.current_role() in ('admin','manager'));

create policy "variants manager delete" on public.product_variants
  for delete to authenticated using (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- customers: read/write for all staff, delete manager+
-- ------------------------------------------------------------------
create policy "customers read" on public.customers
  for select to authenticated using (true);

create policy "customers insert" on public.customers
  for insert to authenticated with check (true);

create policy "customers update" on public.customers
  for update to authenticated using (true);

create policy "customers manager delete" on public.customers
  for delete to authenticated using (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- loyalty_transactions: read/write for all staff
-- ------------------------------------------------------------------
create policy "loyalty read" on public.loyalty_transactions
  for select to authenticated using (true);

create policy "loyalty insert" on public.loyalty_transactions
  for insert to authenticated with check (true);

-- ------------------------------------------------------------------
-- sales: staff insert their own, select own; manager+ select/update all
-- (no delete on sales ever; cashier cannot update -> cannot void)
-- ------------------------------------------------------------------
create policy "sales insert own" on public.sales
  for insert to authenticated
  with check (cashier_id = auth.uid());

create policy "sales select own" on public.sales
  for select to authenticated
  using (cashier_id = auth.uid() or public.current_role() in ('admin','manager'));

create policy "sales manager update" on public.sales
  for update to authenticated
  using (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- sale_items: insert only for a sale the user created; select own/manager
-- ------------------------------------------------------------------
create policy "sale_items insert own" on public.sale_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sales
      where sales.id = sale_id and sales.cashier_id = auth.uid()
    )
  );

create policy "sale_items select own" on public.sale_items
  for select to authenticated
  using (
    public.current_role() in ('admin','manager')
    or exists (
      select 1 from public.sales
      where sales.id = sale_id and sales.cashier_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- payments: insert for own sale; select own/manager
-- ------------------------------------------------------------------
create policy "payments insert own" on public.payments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sales
      where sales.id = sale_id and sales.cashier_id = auth.uid()
    )
  );

create policy "payments select own" on public.payments
  for select to authenticated
  using (
    public.current_role() in ('admin','manager')
    or exists (
      select 1 from public.sales
      where sales.id = sale_id and sales.cashier_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- inventory_transactions: audit log, manager+ only
-- (sale decrements are inserted by the sync Edge Function / RPC)
-- ------------------------------------------------------------------
create policy "inventory manager all" on public.inventory_transactions
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- stock_conflicts: manager review queue
-- ------------------------------------------------------------------
create policy "stock_conflicts manager all" on public.stock_conflicts
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- suppliers & purchase orders: manager+
-- ------------------------------------------------------------------
create policy "suppliers manager all" on public.suppliers
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

create policy "purchase_orders manager all" on public.purchase_orders
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

create policy "purchase_order_items manager all" on public.purchase_order_items
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));

-- ------------------------------------------------------------------
-- app_settings: readable by all staff (void threshold gate),
-- writable by manager+
-- ------------------------------------------------------------------
create policy "app_settings read" on public.app_settings
  for select to authenticated using (true);

create policy "app_settings manager write" on public.app_settings
  for all to authenticated
  using (public.current_role() in ('admin','manager'))
  with check (public.current_role() in ('admin','manager'));
