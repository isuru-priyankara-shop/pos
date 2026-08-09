# Deploy to Vercel (Database & API stay in Supabase)

Your database and API **do not change** — they stay in Supabase. This guide only moves the Next.js app (frontend + serverless routes) to Vercel.

## How it works

```
Browser → Vercel (Next.js app, API routes) → Supabase cloud (Postgres + Auth + RLS + RPCs)
```

- Supabase project: `https://dbjfkmkdvfvtiwzabmle.supabase.co` (already cloud — nothing to move)
- All schema/RLS/RPCs live in `supabase/migrations/` (already applied)
- No edge functions, no Stripe, no file storage — nothing else to deploy

## Prerequisites

- Node.js 20+ (Next.js 16.2.12 needs it)
- GitHub repo pushed (`origin` = `Manoj9991/POS`)
- Supabase dashboard access (project owner)
- Vercel account (free tier is fine)

## Step 1 — Deploy with Vercel CLI

```bash
npm i -g vercel
vercel login          # opens browser — authenticate
vercel link           # link this repo; project name: pos-system
vercel --prod         # first production build & deploy
```

> Alternative: skip the CLI and use the Vercel Dashboard → **Add New Project** → import the GitHub repo — Vercel auto-detects Next.js.

## Step 2 — Environment variables

In Vercel → Project → **Settings → Environment Variables** (Production + Preview + Development), or `vercel env add <KEY> <env>`:

| Variable | Value | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dbjfkmkdvfvtiwzabmle.supabase.co` | yes (starts with `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | your service-role key | **NO** — never add the `NEXT_PUBLIC_` prefix; server-only (powers `/api/admin/*` and voids) |

Optional (currently unused by the code): `SUPABASE_FUNCTION_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Step 3 — Supabase: allow the Vercel domain (required for login)

1. Supabase Dashboard → Authentication → **URL Configuration**
2. **Site URL** = `https://<your-app>.vercel.app`
3. **Redirect URLs** add:
   - `https://<your-app>.vercel.app/**`
   - `https://<your-app>-git-*.vercel.app/**` (preview deploys)
   - keep `http://localhost:3000/**` for local development
4. Save. Auth cookies from the Vercel domain now work.

## Step 4 — Verify

- Open the deployed URL → sign in → land on `/pos`
- Complete a sale at the Register
- Admin check: Staff page (create user via `/api/admin/users`) and Sales → Void a sale
- Toggle light/dark theme (persists), check Analytics loads

## Step 5 — Updates

- Push to `master` → Vercel auto-deploys production
- Preview deploys come from PR branches automatically

## Troubleshooting

- **Login loops / 401** → Step 3 not done; check Site URL + Redirect URLs, also `vercel env pull` to confirm keys
- **Admin endpoints fail** → `SUPABASE_SERVICE_ROLE_KEY` missing or wrong env (not set for Preview)
- **Theme/store details missing** → `app_settings` rows are in Supabase, they sync automatically

## Restoring a fresh Supabase project (only if you ever create one)

```bash
supabase link --project-ref <new-ref>
supabase db push      # applies supabase/migrations/ (schema, RLS, functions, seed)
```

Database contents (products, sales, profiles) do **not** migrate with the code — copy them via Supabase SQL/CSV export if needed.
