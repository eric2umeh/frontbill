-- Store: movement_at (backdating) + atomic bulk stock in/out RPC
-- Run in Supabase SQL Editor after 029 / 031 store migrations.

-- When the stock event actually happened (reports & daily views use this).
ALTER TABLE public.store_stock_movements
  ADD COLUMN IF NOT EXISTS movement_at TIMESTAMPTZ;

UPDATE public.store_stock_movements
SET movement_at = created_at
WHERE movement_at IS NULL;

ALTER TABLE public.store_stock_movements
  ALTER COLUMN movement_at SET DEFAULT now(),
  ALTER COLUMN movement_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_movements_org_movement_at
  ON public.store_stock_movements (organization_id, movement_at DESC);

COMMENT ON COLUMN public.store_stock_movements.movement_at IS
  'Business date/time of the stock movement (supports backdating). Defaults to created_at for legacy rows.';

-- Atomically apply many central-store ins or outs in one transaction.
CREATE OR REPLACE FUNCTION public.apply_store_movement_bulk(
  p_organization_id uuid,
  p_actor_id uuid,
  p_movement_type text,
  p_movement_at timestamptz,
  p_reference text,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  el jsonb;
  i int;
  nx int;
  v_item_id uuid;
  v_qty numeric;
  rec public.store_items%ROWTYPE;
  v_mov_qty numeric;
  v_new_bal numeric;
  v_count int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_actor_id AND p.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_movement_type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'bulk supports only in or out';
  END IF;

  IF p_movement_at IS NULL THEN
    RAISE EXCEPTION 'movement_at is required';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'p_lines must be a non-empty json array';
  END IF;

  nx := jsonb_array_length(p_lines);

  FOR i IN 0 .. nx - 1 LOOP
    el := p_lines->i;
    v_item_id := nullif(trim(el->>'item_id'), '')::uuid;
    v_qty := nullif(replace(trim(el->>'qty'), ',', '.'), '')::numeric;
    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid line: %', el;
    END IF;

    SELECT * INTO rec FROM public.store_items
    WHERE id = v_item_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'item not in organization: %', v_item_id;
    END IF;

    IF p_movement_type = 'in' THEN
      v_mov_qty := v_qty;
      v_new_bal := rec.quantity_on_hand + v_qty;
    ELSE
      v_mov_qty := -v_qty;
      v_new_bal := rec.quantity_on_hand - v_qty;
      IF v_new_bal < 0 THEN
        RAISE EXCEPTION 'insufficient stock for % (have %, need %)', rec.name, rec.quantity_on_hand, v_qty;
      END IF;
    END IF;

    INSERT INTO public.store_stock_movements (
      organization_id,
      item_id,
      movement_type,
      quantity,
      balance_after,
      reference,
      notes,
      created_by,
      destination_department,
      received_by,
      movement_at
    ) VALUES (
      p_organization_id,
      v_item_id,
      p_movement_type,
      v_mov_qty,
      v_new_bal,
      nullif(trim(p_reference), ''),
      nullif(trim(p_notes), ''),
      p_actor_id,
      NULL,
      NULL,
      p_movement_at
    );

    UPDATE public.store_items
    SET
      quantity_on_hand = v_new_bal,
      updated_at = now(),
      updated_by = p_actor_id
    WHERE id = rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'applied', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_store_movement_bulk(uuid, uuid, text, timestamptz, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_store_movement_bulk(uuid, uuid, text, timestamptz, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_store_movement_bulk(uuid, uuid, text, timestamptz, text, text, jsonb) TO service_role;
