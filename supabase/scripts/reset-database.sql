-- =============================================================
-- scripts/reset-database.sql
-- Wipe ALL business data and start fresh, keeping ONLY the admin.
-- Run this in Supabase Dashboard -> SQL Editor (it is idempotent
-- and safe to re-run).
--
-- WHAT IS KEPT:
--   * Database schema, functions, triggers, RLS policies
--   * The admin user (auth.users) and its profiles row
--   * Nothing else
--
-- WHAT IS DELETED:
--   * All products, variants, categories, customers, sales,
--     payments, inventory transactions, suppliers, purchase
--     orders, stock conflicts, loyalty history
--   * All non-admin users (auth + profiles)
--   * app_settings are reset to defaults (void_threshold, tax_rate)
--     NOTE: store name / location / category are wiped too.
--     To KEEP store details, comment out the TRUNCATE of
--     app_settings and the re-insert below.
-- =============================================================

-- ------------------------------------------------------------------
-- 1) Business data (children first, FK-safe order)
-- ------------------------------------------------------------------
truncate table public.purchase_order_items;
truncate table public.sale_items;
truncate table public.payments;
truncate table public.stock_conflicts;
truncate table public.sales;
truncate table public.inventory_transactions;
truncate table public.loyalty_transactions;
truncate table public.purchase_orders;
truncate table public.product_variants;
truncate table public.products;
truncate table public.categories;
truncate table public.customers;
truncate table public.suppliers;

-- ------------------------------------------------------------------
-- 2) app_settings -> back to factory defaults
-- ------------------------------------------------------------------
truncate table public.app_settings;
insert into public.app_settings (key, value) values
  ('void_threshold', '0'), -- amounts above this need manager approval
  ('tax_rate', '0')        -- percent
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 3) Remove every non-admin account (auth + profile cascade).
--    Admin is identified by role = 'admin' on profiles.
-- ------------------------------------------------------------------
delete from auth.users u
where not exists (
  select 1 from public.profiles p
  where p.id = u.id and p.role = 'admin'
);

-- orphaned profiles without an auth account (defensive)
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- ------------------------------------------------------------------
-- 4) Sanity check: exactly the admin(s) remain
-- ------------------------------------------------------------------
select id, email,
       coalesce(raw_user_meta_data->>'full_name', email) as name
from auth.users;

select id, full_name, role, is_active from public.profiles;
