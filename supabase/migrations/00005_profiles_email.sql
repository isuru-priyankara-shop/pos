-- =============================================================
-- 00005_profiles_email.sql
-- Store the auth email on profiles so staff management UI can
-- list users without touching auth.users (RLS-visible).
-- =============================================================

alter table public.profiles
  add column if not exists email text;

-- backfill existing profiles
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- keep trigger in sync (also sets email for new signups)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'cashier', false, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
