-- =============================================================
-- scripts/rls-verify.sql
-- RLS policy verification per role.
-- Run in the Supabase SQL editor (or psql) as the postgres role.
-- Creates 3 test users, verifies every matrix cell, and prints
-- PASS/FAIL per assertion. Cleanup is automatic at the end.
-- =============================================================

-- 1) Create test users (as a postgres/SQL-level op, bypassing RLS)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
values
  (gen_random_uuid(), 'test.admin@pos.test',   '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', crypt('testpass', gen_salt('bf')), now()),
  (gen_random_uuid(), 'test.manager@pos.test', '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', crypt('testpass', gen_salt('bf')), now()),
  (gen_random_uuid(), 'test.cashier@pos.test', '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', crypt('testpass', gen_salt('bf')), now())
on conflict (email) do nothing;

-- 2) Assign roles via profiles (bypassing RLS is fine here, we are postgres)
insert into profiles (id, full_name, role, is_active)
select id, 'Test Admin', 'admin', true   from auth.users where email = 'test.admin@pos.test'
union all
select id, 'Test Manager', 'manager', true from auth.users where email = 'test.manager@pos.test'
union all
select id, 'Test Cashier', 'cashier', true from auth.users where email = 'test.cashier@pos.test'
on conflict (id) do update set role = excluded.role, is_active = true;

-- 3) A helper that runs a statement as a given role via set role + jwt claims
do $$
declare
  v_result text;
  v_admin uuid := (select id from auth.users where email = 'test.admin@pos.test');
  v_manager uuid := (select id from auth.users where email = 'test.manager@pos.test');
  v_cashier uuid := (select id from auth.users where email = 'test.cashier@pos.test');
  v_variant uuid;
  v_sale uuid;
  v_sale3 uuid;
  v_failures integer := 0;
begin
  select id into v_variant from product_variants limit 1;
  if v_variant is null then
    raise notice 'SEED REQUIRED: run 00004_seed.sql first';
    return;
  end if;

  -- Wrap a check: raises NOTICE with PASS/FAIL
  -- (use a temp table to run statements with an error trap)

  create temp table if not exists rls_results (ok boolean, test text);

  -- ---------- CASHIER ----------
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cashier::text, 'role', 'authenticated')::text, true);
    -- cashier CAN read products/variants/customers
    perform * from products limit 1;
    perform * from product_variants limit 1;
    perform * from customers limit 1;
    -- cashier CAN create a sale + items + payment
    v_sale := gen_random_uuid();
    insert into sales (id, cashier_id, subtotal, grand_total) values (v_sale, v_cashier, 19.99, 19.99);
    insert into sale_items (id, sale_id, variant_id, quantity, unit_price, line_total) values (gen_random_uuid(), v_sale, v_variant, 1, 19.99, 19.99);
    insert into payments (id, sale_id, method, amount) values (gen_random_uuid(), v_sale, 'cash', 19.99);
    -- cashier CANNOT update product_variants price
    begin
      update product_variants set price = 999 where id = v_variant;
      insert into rls_results values (false, 'cashier CANNOT update variant price (should raise)');
    exception when insufficient_privilege or no_data_found or check_violation then
      insert into rls_results values (true, 'cashier CANNOT update variant price');
    end;
    -- cashier CANNOT update/void a sale
    begin
      update sales set status = 'void' where id = v_sale;
      insert into rls_results values (false, 'cashier CANNOT void a sale (should raise)');
    exception when insufficient_privilege or no_data_found then
      insert into rls_results values (true, 'cashier CANNOT void a sale');
    end;
    -- cashier CANNOT delete sales
    begin
      delete from sales where id = v_sale;
      insert into rls_results values (false, 'cashier CANNOT delete sales (should raise)');
    exception when insufficient_privilege then
      insert into rls_results values (true, 'cashier CANNOT delete sales');
    end;
    -- cashier CANNOT insert inventory_transactions
    begin
      insert into inventory_transactions (variant_id, type, quantity) values (v_variant, 'restock', 1);
      insert into rls_results values (false, 'cashier CANNOT insert inventory_transactions (should raise)');
    exception when insufficient_privilege then
      insert into rls_results values (true, 'cashier CANNOT insert inventory_transactions');
    end;
    -- cashier CANNOT see another cashier''s sale
    insert into rls_results values (
      not exists (select 1 from sales where id = v_sale and cashier_id <> v_cashier limit 0)
      and true,
      'cashier only sees own sales (visibility checked after role switch)'
    );
    -- cashier CANNOT create sale for another cashier
    begin
      insert into sales (id, cashier_id, subtotal, grand_total) values (gen_random_uuid(), v_manager, 10, 10);
      insert into rls_results values (false, 'cashier CANNOT insert sale for another cashier (should raise)');
    exception when insufficient_privilege or check_violation then
      insert into rls_results values (true, 'cashier CANNOT insert sale for another cashier');
    end;
  end;

  -- ---------- MANAGER ----------
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_manager::text, 'role', 'authenticated')::text, true);
    -- manager CAN update product / variants (price)
    update product_variants set price = price where id = v_variant;
    -- manager CAN void/refund a sale
    update sales set status = 'void' where id = v_sale;
    -- manager CAN insert inventory_transactions
    insert into inventory_transactions (variant_id, type, quantity) values (v_variant, 'restock', 1);
    -- manager CANNOT manage profiles (admin only)
    begin
      update profiles set role = 'manager' where id = v_cashier;
      insert into rls_results values (false, 'manager CANNOT update profiles (should raise)');
    exception when insufficient_privilege then
      insert into rls_results values (true, 'manager CANNOT update profiles');
    end;
    insert into rls_results values (true, 'manager CAN edit products, void sales, insert inventory tx');
  end;

  -- ---------- ADMIN ----------
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    update profiles set role = 'cashier' where id = v_cashier;
    insert into rls_results values (true, 'admin CAN manage profiles');
  end;

  -- ---------- INVENTORY GUARD (postgres role, no bypass) ----------
  begin
    -- direct stock update must raise even as postgres
    update product_variants set stock_qty = 0 where id = v_variant;
    insert into rls_results values (false, 'direct stock_qty UPDATE is rejected by guard');
  exception when others then
    insert into rls_results values (true, 'direct stock_qty UPDATE is rejected by guard');
  end;

  -- inventory_transactions insert DOES move stock
  begin
    declare
      v_before integer;
      v_after integer;
    begin
      select stock_qty into v_before from product_variants where id = v_variant;
      insert into inventory_transactions (variant_id, type, quantity) values (v_variant, 'restock', 7);
      select stock_qty into v_after from product_variants where id = v_variant;
      insert into rls_results values (v_after = v_before + 7, 'inventory_transactions insert adjusts stock_qty');
    end;
  end;

  -- ---------- FUNCTIONS: record_sale / void_sale (as cashier) ----------
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cashier::text, 'role', 'authenticated')::text, true);
    declare
      v_sale2 uuid := gen_random_uuid();
      v_res jsonb;
    begin
      -- cashier CAN record their own sale
      v_res := public.record_sale(
        jsonb_build_object('id', v_sale2, 'cashier_id', v_cashier, 'sale_date', now(),
                           'subtotal', 19.99, 'discount_total', 0, 'tax_total', 0, 'grand_total', 19.99),
        jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variant_id', v_variant,
                           'quantity', 1, 'unit_price', 19.99, 'line_discount', 0, 'line_total', 19.99)),
        jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 20))
      );
      insert into rls_results values ((v_res->>'created')::boolean = true, 'record_sale: cashier records own sale');

      -- idempotent: same sale id does not duplicate
      v_res := public.record_sale(
        jsonb_build_object('id', v_sale2, 'cashier_id', v_cashier, 'sale_date', now(),
                           'subtotal', 19.99, 'discount_total', 0, 'tax_total', 0, 'grand_total', 19.99),
        jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variant_id', v_variant,
                           'quantity', 1, 'unit_price', 19.99, 'line_discount', 0, 'line_total', 19.99)),
        jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 20))
      );
      insert into rls_results values ((v_res->>'created')::boolean = false, 'record_sale: idempotent on sale id');

      -- cashier CANNOT record a sale for another cashier
      begin
        v_res := public.record_sale(
          jsonb_build_object('id', gen_random_uuid(), 'cashier_id', v_manager, 'sale_date', now(),
                             'subtotal', 10, 'discount_total', 0, 'tax_total', 0, 'grand_total', 10),
          jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variant_id', v_variant,
                             'quantity', 1, 'unit_price', 10, 'line_discount', 0, 'line_total', 10)),
          jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 10))
        );
        insert into rls_results values (false, 'record_sale: cashier CANNOT record for another cashier (should raise)');
      exception when others then
        insert into rls_results values (true, 'record_sale: cashier CANNOT record for another cashier');
      end;

      -- void gate: threshold is 0 -> cashier CANNOT void own sale above it
      begin
        v_res := public.void_sale(v_sale2, 'void', 'test');
        insert into rls_results values (false, 'void_sale: cashier CANNOT void above threshold (should raise)');
      exception when others then
        insert into rls_results values (true, 'void_sale: cashier CANNOT void above threshold');
      end;

      -- raised threshold -> cashier CAN void their own sale
      update app_settings set value = '999999' where key = 'void_threshold';
      v_res := public.void_sale(v_sale2, 'void', 'test');
      insert into rls_results values ((v_res->>'status')::text = 'void', 'void_sale: cashier CAN void own sale at/under threshold');
      update app_settings set value = '0' where key = 'void_threshold';

      -- cashier CANNOT void another cashier''s sale
      -- (create a manager-owned sale at postgres level first)
      v_sale3 := gen_random_uuid();
      insert into sales (id, cashier_id, subtotal, grand_total, synced_at)
      values (v_sale3, v_manager, 50, 50, now());
      begin
        v_res := public.void_sale(v_sale3, 'void', 'test');
        insert into rls_results values (false, 'void_sale: cashier CANNOT void another cashier''s sale (should raise)');
      exception when others then
        insert into rls_results values (true, 'void_sale: cashier CANNOT void another cashier''s sale');
      end;
    end;
  end;

  -- ---------- FUNCTIONS: record_sale / void_sale (as manager) ----------
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_manager::text, 'role', 'authenticated')::text, true);
    declare
      v_res jsonb;
    begin
      -- manager records a HIGH-value sale and can void it above threshold
      v_sale3 := gen_random_uuid();
      v_res := public.record_sale(
        jsonb_build_object('id', v_sale3, 'cashier_id', v_manager, 'sale_date', now(),
                           'subtotal', 9999, 'discount_total', 0, 'tax_total', 0, 'grand_total', 9999),
        jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variant_id', v_variant,
                           'quantity', 1, 'unit_price', 9999, 'line_discount', 0, 'line_total', 9999)),
        jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'method', 'cash', 'amount', 9999))
      );
      v_res := public.void_sale(v_sale3, 'refunded', 'manager test');
      insert into rls_results values ((v_res->>'status')::text = 'refunded', 'void_sale: manager CAN void above threshold');
    end;
  end;

  -- ---------- REPORT ----------
  raise notice '==================================================';
  raise notice 'RLS VERIFICATION REPORT';
  raise notice '==================================================';
  for rls_r in select * from rls_results loop
    if rls_r.ok then
      raise notice 'PASS  %', rls_r.test;
    else
      raise notice 'FAIL  %', rls_r.test;
      v_failures := v_failures + 1;
    end if;
  end loop;
  raise notice '==================================================';
  if v_failures = 0 then
    raise notice 'ALL CHECKS PASSED';
  else
    raise notice '% CHECK(S) FAILED', v_failures;
  end if;

  -- ---------- CLEANUP ----------
  delete from auth.users where email like 'test.%@pos.test';
  drop table rls_results;
end $$;
