# Store POS — Clothing Shop Point of Sale

Offline-first POS for a single clothing store. Next.js (App Router, TypeScript) PWA + Supabase
(Postgres, Auth, Realtime, Storage, Edge Functions) + Dexie.js offline cache.

## Stack

- **Frontend:** Next.js 16 (App Router, `proxy.ts`), Tailwind v4, shadcn/ui, Radix
- **Backend:** Supabase (Postgres + RLS, Auth, Realtime, Storage, Edge Functions)
- **Offline:** Dexie.js (IndexedDB), PWA service worker, background sync engine
- **Testing:** Vitest (unit), Playwright (e2e)
- **Payments:** Stripe via Edge Function (never client-side)

## Project structure

```
src/
  app/(dashboard)/      protected POS screens (pos, inventory, sales, ...)
  app/login/            staff sign-in
  components/           shadcn/ui + app components
  lib/
    supabase/           browser + server clients
    db.types.ts         schema types (mirrors migrations)
    auth.ts             role gating helpers
    money.ts            currency math (2dp-safe)
supabase/
  migrations/           00001 schema, 00002 RLS, 00003 indexes, 00004 seed, 00005 profiles email, 00006 POS functions
  scripts/              rls-verify.sql, bootstrap-admin.sql
  functions/            Edge Functions (sync-sale, void-sale, stripe-*)
```

## Setup

1. Create a Supabase project at https://supabase.com/dashboard.
2. Run the migrations in `supabase/migrations/` (in order) in the SQL editor.
3. Copy `.env.example` to `.env.local` — fill in URL, anon key **and** `SUPABASE_SERVICE_ROLE_KEY`
   (Project Settings → API → service_role; needed by the Staff section to create login accounts).
4. Create your first staff user in **Auth → Users → Add user** (email/password).
4. Run `supabase/scripts/bootstrap-admin.sql` with that email — makes them an active admin.
5. Copy `.env.example` to `.env.local` and fill in the Supabase URL + anon key.
6. In Supabase Dashboard → Auth → Settings:
   - disable public sign-ups (admins create staff users)
   - allowlist the app URL (http://localhost:3000 for dev)
7. `npm install && npm run dev`

## Verification

- RLS: run `supabase/scripts/rls-verify.sql` against the project — asserts per-role
  permissions (cashier read/insert only, manager void + inventory, admin profiles),
  the stock-guard trigger, and `record_sale`/`void_sale` gates (idempotency, threshold).
- Unit: `npm run test` (auth role gating, money math, barcode scanner, POS payloads)
- Typecheck: `npm run typecheck` · Lint: `npm run lint`

## Inventory management (Phase 1)

- `/inventory` (manager+) — product table with search, category & stock-level filters,
  low/out-of-stock warnings. Add/edit products (image upload to `product-images` bucket),
  add size/color variants (barcode, price, cost, reorder level), enable/disable variants
  (keeps sale history; deletion only allowed if never used).
- Stock changes go through `inventory_transactions` (restock / adjust / sale / return) —
  the guard trigger rejects direct `stock_qty` UPDATEs. Per-variant history dialog shows
  the audit trail. Categories are managed in the Categories dialog.
- Requires migration `00007_inventory.sql`: adds `product_variants.is_active` (POS only
  lists active variants) and creates the `product-images` storage bucket + policies.

## Customers

- `/customers` (all staff) — search by name/phone/email, add/edit customers
  (name required, phone/email optional with validation). Loyalty points and credit
  balance display read-only (tracked in future phases). Delete is manager+ only;
  customers referenced by sales are protected by FK.

## Sales reporting (Phase 4)

- `/reports` (manager+) — period selector (today / 7 days / this month / last month /
  custom range) over summary cards: revenue, orders, items sold, profit + margin %,
  voided count (voids excluded from totals). Payment split, 14-day revenue bars,
  best sellers (units/revenue/profit), slow movers (in-stock variants with zero sales
  in the period).
- Profit uses `sale_items.cost_price`, snapshotted by `record_sale` at sale time
  (migration `00008_reports.sql`), so historical margins don't drift when costs change.
  Margin is shown only over items with a known cost; set cost prices on variants to
  populate it.

## POS flow (Phase 2)

- `/pos` — scan barcode or tap a product → pick size/color → cart → Charge → payment
  (cash/card/qr/credit, split allowed, cash change) → printable receipt.
- Sales are written by `record_sale` (idempotent on the client-generated sale UUID),
  stock decrements through `inventory_transactions`.
- `/sales` — history; void/refund restores stock; above `void_threshold` a manager's
  email + password must be entered (validated server-side in `POST /api/sales/[id]/void`).
