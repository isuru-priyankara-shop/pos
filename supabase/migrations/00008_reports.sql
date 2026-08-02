-- =============================================================
-- 00008_reports.sql
-- Cost snapshot for profit margin reporting:
--   * sale_items.cost_price captures the variant's cost at sale
--     time, so past margins don't drift when cost_price changes.
--   * record_sale snapshots it server-side (authoritative for
--     both end-user and service-role callers).
--   * Existing rows are backfilled from the current variant cost.
-- No new RLS: manager+ already has SELECT on all report tables.
-- =============================================================

alter table public.sale_items
  add column if not exists cost_price numeric(10,2);

-- ------------------------------------------------------------------
-- record_sale: snapshot variant cost into each sale item.
-- ------------------------------------------------------------------
create or replace function public.record_sale(
  p_sale jsonb,
  p_items jsonb,
  p_payments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_cashier_id uuid := auth.uid();
  v_item jsonb;
  v_payment jsonb;
  v_offline boolean;
  v_is_service boolean := coalesce(auth.jwt()::jsonb->>'role', '') = 'service_role';
begin
  if v_cashier_id is null and not v_is_service then
    raise exception 'Not authenticated';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Sale has no items';
  end if;

  v_sale_id := (p_sale->>'id')::uuid;
  if v_sale_id is null then
    raise exception 'Sale id is required (client-generated UUID)';
  end if;

  -- cashier must be the acting user (RLS would normally enforce this;
  -- SECURITY DEFINER re-checks it explicitly). Service-role callers
  -- (offline sync / API routes, which authorize the caller themselves)
  -- are trusted with the payload's cashier_id.
  if (p_sale->>'cashier_id')::uuid is distinct from v_cashier_id and not v_is_service then
    raise exception 'cashier_id does not match the authenticated user';
  end if;

  -- resolved cashier (payload for service role, auth.uid() for end users)
  v_cashier_id := (p_sale->>'cashier_id')::uuid;
  if v_cashier_id is null then
    raise exception 'cashier_id is required';
  end if;

  -- idempotency: already recorded?
  if exists (select 1 from public.sales where id = v_sale_id) then
    return jsonb_build_object('id', v_sale_id, 'created', false);
  end if;

  v_offline := coalesce((p_sale->>'created_offline')::boolean, false);

  insert into public.sales
    (id, customer_id, cashier_id, sale_date, subtotal, discount_total,
     tax_total, grand_total, status, created_offline, synced_at)
  values (
    v_sale_id,
    (p_sale->>'customer_id')::uuid,
    v_cashier_id,
    coalesce((p_sale->>'sale_date')::timestamptz, now()),
    (p_sale->>'subtotal')::numeric,
    coalesce((p_sale->>'discount_total')::numeric, 0),
    coalesce((p_sale->>'tax_total')::numeric, 0),
    (p_sale->>'grand_total')::numeric,
    'completed',
    v_offline,
    case when v_offline then null else now() end
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity')::integer <= 0 then
      raise exception 'Invalid quantity for variant %', v_item->>'variant_id';
    end if;
    insert into public.sale_items
      (id, sale_id, variant_id, quantity, unit_price, line_discount, line_total, cost_price)
    values (
      (v_item->>'id')::uuid,
      v_sale_id,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'line_discount')::numeric, 0),
      (v_item->>'line_total')::numeric,
      (select cost_price from public.product_variants where id = (v_item->>'variant_id')::uuid)
    );

    -- audit trail: the apply_inventory_transaction trigger adjusts stock
    insert into public.inventory_transactions (variant_id, type, quantity, reference_id)
    values ((v_item->>'variant_id')::uuid, 'sale', (v_item->>'quantity')::integer, v_sale_id);
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    insert into public.payments (id, sale_id, method, amount, transaction_ref, status)
    values (
      (v_payment->>'id')::uuid,
      v_sale_id,
      (v_payment->>'method')::text,
      (v_payment->>'amount')::numeric,
      nullif(v_payment->>'transaction_ref', ''),
      coalesce((v_payment->>'status')::text, 'success')
    );
  end loop;

  return jsonb_build_object('id', v_sale_id, 'created', true);
end;
$$;

-- ------------------------------------------------------------------
-- Backfill: existing sale items get the variant's current cost.
-- (Best-effort; items whose variant was deleted keep NULL and are
--  reported as "cost unknown" rather than guessed.)
-- ------------------------------------------------------------------
update public.sale_items si
set cost_price = pv.cost_price
from public.product_variants pv
where pv.id = si.variant_id
  and si.cost_price is null
  and pv.cost_price is not null;
