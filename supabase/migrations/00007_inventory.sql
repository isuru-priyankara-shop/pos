-- =============================================================
-- 00007_inventory.sql
-- 1) Soft-disable support for variants
-- 2) product-images storage bucket + policies
-- =============================================================

-- --------------------------------------------------------------
-- 1) product_variants.is_active
-- --------------------------------------------------------------
alter table public.product_variants
  add column if not exists is_active boolean not null default true;

create index if not exists idx_variants_active on public.product_variants(is_active);

-- --------------------------------------------------------------
-- 2) Storage bucket for product photos
--    public read (images shown in the app), manager+ upload/delete
-- --------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product_images public read"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "product_images manager insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.current_role() in ('admin', 'manager')
  );

create policy "product_images manager update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_role() in ('admin', 'manager')
  );

create policy "product_images manager delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_role() in ('admin', 'manager')
  );
