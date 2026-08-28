# Reset Database (Start Fresh — Admin Only)

How to clear **all** data in the Supabase database and start fresh,
keeping only the admin user. The schema, security rules (RLS),
functions and triggers are **kept** — only data is removed.

> App version: Kadex POS — this doc matches the migrations in
> `supabase/migrations/` and the reset script in
> `supabase/scripts/reset-database.sql`.

---

## What is kept / what is deleted

| Kept | Deleted |
| --- | --- |
| Database schema, functions, triggers, RLS policies | Products, variants, categories |
| The **admin** user (`auth.users` + its `profiles` row) | Customers + loyalty history |
| `app_settings` defaults (`void_threshold`, `tax_rate`) | Sales, payments, sale items |
| | Inventory transactions, stock conflicts |
| | Suppliers, purchase orders + items |
| | All **other** users (cashier/manager accounts) |
| | Store name / location / category (re-enter in Settings) |

---

## Method 1 — SQL reset script (recommended)

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Open `supabase/scripts/reset-database.sql` and paste the full
   contents (or copy it into the editor).
3. Click **Run**.

That's it. The script:

1. Truncates every business table in FK-safe order
   (purchase items → payments/sale items → sales → variants → products
   → categories → customers → suppliers).
2. Resets `app_settings` to factory defaults.
3. Deletes every **non-admin** user — identified by
   `profiles.role = 'admin'` — from `auth.users` (their profiles
   cascade-delete).
4. Prints the remaining users for a sanity check.

### If your admin is not flagged `role = 'admin'`

Make the admin first, then re-run the reset:

```sql
-- replace owner@yourstore.com with the admin email
insert into public.profiles (id, full_name, role, is_active)
select id, coalesce(raw_user_meta_data->>'full_name', email), 'admin', true
from auth.users
where email = 'owner@yourstore.com'
on conflict (id) do update
  set role = 'admin', is_active = true;
```

(This is exactly what `supabase/scripts/bootstrap-admin.sql` does.)

---

## Method 2 — Nuclear reset (delete the whole project)

Only if you also want a brand-new schema / fresh project:

1. **Supabase Dashboard** → Project Settings → **Danger zone** →
   **Delete project**.
2. Create a **new project** in the same region.
3. Apply the migrations in order:
   `supabase/migrations/00001_schema.sql` → `00002_rls.sql` →
   `00003_indexes.sql` → `00004_seed.sql` → `00005_profiles_email.sql`
   → `00006_pos_functions.sql` → `00007_inventory.sql` →
   `00008_reports.sql` (SQL Editor, one at a time).
4. **Authentication → Users → Add user** → create the admin account.
5. Run `supabase/scripts/bootstrap-admin.sql` (paste the admin email).
6. Skip `00004_seed.sql` if you do **not** want the sample products
   and customers.

---

## After the reset (important)

1. **Sign out / close the POS on all devices** (or at least hard
   refresh with Ctrl+Shift+R) so stale cached products, settings and
   open sessions are discarded.
2. Log in with the **admin** account.
3. Re-configure in **Settings** (unlocked with the product-owner
   password `0701`):
   - Store name / location / category
   - Theme colors (optional)
4. Add staff, categories and products as needed — the register,
   inventory and reports pages will be empty until you do.

---

## Verify it worked

```sql
select 'profiles' as table_name, count(*) from public.profiles
union all select 'sales',              count(*) from public.sales
union all select 'payments',           count(*) from public.payments
union all select 'products',           count(*) from public.products
union all select 'product_variants',   count(*) from public.product_variants
union all select 'categories',         count(*) from public.categories
union all select 'customers',          count(*) from public.customers
union all select 'inventory_transactions', count(*) from public.inventory_transactions;
```

Expect: `profiles` = 1 (the admin), everything else = 0.

---

## Rollback

There is no rollback — the script is destructive. Take a **Database
backup** first if you might need the old data:

**Supabase Dashboard → Database → Backups → Create a backup** (or
download a dump via `supabase db dump --data-only` if you use the CLI).

---

## Notes

- **Offline sync:** this app version records sales directly online
  (`created_offline = false`), so there is no local pending queue to
  flush. Just hard-refresh each browser after the reset.
- **Passwords:** deleting a user in `auth.users` also invalidates
  their password login — only the admin remains able to sign in.
- The reset script is **idempotent** — running it twice is harmless.
