-- FrontBill — Remove duplicate hotel store SKUs (e.g. after running script 030 twice)
--
-- Rule: duplicates = same organization_id + same category_id + same item name (trimmed, lowercase).
-- action: KEEP the earliest row per group (created_at, then id). Repoint movements, add duplicate
-- quantity_on_hand onto the keeper, DELETE duplicate rows.
--
-- OPTIONAL: Uncomment the organization filter below to touch only one tenant.
--
-- Run the whole file once in Supabase SQL Editor.
--
-- NOTE: Do not use a bare CREATE TEMP TABLE + separate statements. The SQL editor / pool can run
-- statements on different connections, so _fb_store_dedupe_map would not exist for the UPDATEs.
-- Everything below runs inside one DO block (single backend session + transaction).

DO $dedupe$
BEGIN
  CREATE TEMP TABLE _fb_store_dedupe_map (
    loser_id uuid PRIMARY KEY,
    keeper_id uuid NOT NULL
  );

  INSERT INTO _fb_store_dedupe_map (loser_id, keeper_id)
  WITH base AS (
    SELECT
      id,
      organization_id,
      category_id,
      lower(trim(name)) AS nname,
      COUNT(*) OVER (PARTITION BY organization_id, category_id, lower(trim(name))) AS grp_cnt,
      ROW_NUMBER() OVER (
        PARTITION BY organization_id, category_id, lower(trim(name))
        ORDER BY created_at ASC NULLS LAST, id ASC
      ) AS rn
    FROM public.store_items
    WHERE TRUE
      -- Uncomment and set UUID to dedupe ONE hotel only:
      -- AND organization_id = CAST('REPLACE_WITH_ORGANIZATION_UUID' AS uuid)
  ),
  keepers AS (
    SELECT organization_id, category_id, nname, id AS keeper_id
    FROM base
    WHERE grp_cnt > 1 AND rn = 1
  ),
  losers AS (
    SELECT b.id AS loser_id, k.keeper_id
    FROM base b
    JOIN keepers k
      ON b.organization_id = k.organization_id
     AND b.category_id IS NOT DISTINCT FROM k.category_id
     AND b.nname = k.nname
    WHERE b.grp_cnt > 1 AND b.rn > 1
  )
  SELECT loser_id, keeper_id FROM losers;

  -- 1) Point all movements at the surviving SKU id
  UPDATE public.store_stock_movements m
  SET item_id = d.keeper_id
  FROM _fb_store_dedupe_map d
  WHERE m.item_id = d.loser_id;

  -- 2) Add duplicate rows’ on-hand qty to the keeper
  UPDATE public.store_items keeper
  SET
    quantity_on_hand = keeper.quantity_on_hand + COALESCE(losses.extra, 0),
    updated_at = now()
  FROM (
    SELECT m.keeper_id, SUM(i.quantity_on_hand) AS extra
    FROM _fb_store_dedupe_map m
    JOIN public.store_items i ON i.id = m.loser_id
    GROUP BY m.keeper_id
  ) losses
  WHERE keeper.id = losses.keeper_id;

  -- 3) Delete duplicate SKU rows
  DELETE FROM public.store_items si
  USING _fb_store_dedupe_map d
  WHERE si.id = d.loser_id;

  DROP TABLE _fb_store_dedupe_map;
END;
$dedupe$;

-- Sanity check afterward:
-- SELECT organization_id, lower(trim(name)), category_id, COUNT(*) FROM public.store_items
-- GROUP BY 1,2,3 HAVING COUNT(*) > 1;
