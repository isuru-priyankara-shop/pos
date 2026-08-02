-- =============================================================
-- scripts/bootstrap-admin.sql
-- Make the first user an active admin.
-- Run in Supabase SQL editor AFTER creating the user in Supabase Auth:
--   replace 'owner@yourstore.com' with the auth email, then run.
-- =============================================================

insert into public.profiles (id, full_name, role, is_active)
select id, coalesce(raw_user_meta_data->>'full_name', email), 'admin', true
from auth.users
where email = 'manojlakshan9991@gmail.com'
on conflict (id) do update
  set role = 'admin', is_active = true, full_name = excluded.full_name;
