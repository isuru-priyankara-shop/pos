-- =============================================================
-- 00003_indexes.sql
-- Performance indexes + Realtime publication for live stock sync
-- =============================================================

-- checkout lookups
create index if not exists idx_product_variants_barcode on public.product_variants(barcode);
create index if not exists idx_sales_sale_date on public.sales(sale_date desc);
create index if not exists idx_customers_phone on public.customers(phone);

-- joins / reporting
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_sale_items_variant_id on public.sale_items(variant_id);
create index if not exists idx_payments_sale_id on public.payments(sale_id);
create index if not exists idx_inventory_transactions_variant on public.inventory_transactions(variant_id);
create index if not exists idx_inventory_transactions_created on public.inventory_transactions(created_at desc);
create index if not exists idx_variants_product_id on public.product_variants(product_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_loyalty_customer on public.loyalty_transactions(customer_id);

-- offline sync query
create index if not exists idx_sales_synced_at on public.sales(synced_at);

-- Realtime: push live stock/price updates to connected terminals
alter publication supabase_realtime add table public.product_variants;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.customers;
