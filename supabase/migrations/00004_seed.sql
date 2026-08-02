-- =============================================================
-- 00004_seed.sql
-- Seed: admin bootstrap, sample catalog, sample customers
-- NOTE: run after creating your admin user in Supabase Auth and
-- paste the user UUID below, OR use the /scripts/bootstrap-admin.sql
-- after the project is created.
-- =============================================================

-- Sample categories
insert into public.categories (name) values
  ('Tops'), ('Bottoms'), ('Dresses'), ('Outerwear'), ('Accessories')
on conflict do nothing;

-- Sample products + variants
-- (idempotent: only inserts if the sample barcode does not exist)
do $$
begin
  if not exists (select 1 from public.product_variants where barcode = '100000000001') then
    insert into public.products (name, sku_prefix, category_id, description) values
      ('Classic White Tee', 'TS', (select id from public.categories where name = 'Tops'), 'Cotton crew-neck t-shirt'),
      ('Slim Fit Jeans', 'JN', (select id from public.categories where name = 'Bottoms'), 'Stretch denim slim fit'),
      ('Linen Summer Dress', 'DR', (select id from public.categories where name = 'Dresses'), 'Lightweight breathable linen');

    insert into public.product_variants (product_id, size, color, barcode, price, cost_price, stock_qty, reorder_level) values
      ((select id from public.products where name = 'Classic White Tee'), 'M',  'White', '100000000001', 19.99, 8.00, 50, 5),
      ((select id from public.products where name = 'Classic White Tee'), 'L',  'White', '100000000002', 19.99, 8.00, 40, 5),
      ((select id from public.products where name = 'Classic White Tee'), 'XL', 'Black', '100000000003', 21.99, 9.00, 30, 5),
      ((select id from public.products where name = 'Slim Fit Jeans'),   '32', 'Blue',  '200000000001', 49.99, 22.00, 25, 3),
      ((select id from public.products where name = 'Slim Fit Jeans'),   '34', 'Blue',  '200000000002', 49.99, 22.00, 20, 3),
      ((select id from public.products where name = 'Linen Summer Dress'),'S', 'Sand',  '300000000001', 59.99, 28.00, 15, 3);
  end if;
end $$;

-- Sample customers
insert into public.customers (name, phone, email) values
  ('Anna Baker',    '+15551230001', 'anna@example.com'),
  ('Carlos Reyes',  '+15551230002', 'carlos@example.com')
on conflict do nothing;
