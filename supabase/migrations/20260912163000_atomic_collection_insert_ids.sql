-- Collection Foundation Phase 2/3: return IDs from atomic collection inserts
--
-- Existing insert_user_copies callers only needed a count. Single-copy APIs
-- also need the created instance ID, so keep the same atomic insert contract
-- while returning inserted_ids in the JSON result.

CREATE OR REPLACE FUNCTION public._insert_user_copy_rows_with_ids(
  p_user_id uuid,
  p_rows jsonb,
  p_default_location_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_location_id integer;
  v_copy_id integer;
  v_inserted_ids jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_copy_rows'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS rows(
      card_id integer,
      printing_id text,
      finish text,
      language text,
      is_proxy boolean,
      proxy_for_card_id integer,
      card_condition text,
      purchase_price numeric,
      acquired_at text,
      source_tag text,
      location_id integer
    )
  LOOP
    IF v_row.card_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM user_cards uc
      WHERE uc.id = v_row.card_id
        AND uc.user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'card_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    v_location_id := COALESCE(v_row.location_id, p_default_location_id);

    IF v_location_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM user_locations ul
      WHERE ul.id = v_location_id
        AND ul.user_id = p_user_id
        AND ul.type = 'storage'
    ) THEN
      RAISE EXCEPTION 'storage_location_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO user_copies (
      card_id,
      printing_id,
      finish,
      language,
      is_proxy,
      proxy_for_card_id,
      condition,
      purchase_price,
      acquired_at,
      source_tag,
      location_id,
      user_id
    )
    VALUES (
      v_row.card_id,
      v_row.printing_id,
      COALESCE(v_row.finish, 'nonfoil'),
      COALESCE(v_row.language, 'en'),
      COALESCE(v_row.is_proxy, false),
      v_row.proxy_for_card_id,
      v_row.card_condition,
      v_row.purchase_price,
      v_row.acquired_at,
      v_row.source_tag,
      v_location_id,
      p_user_id
    )
    RETURNING id INTO v_copy_id;

    v_inserted_ids := v_inserted_ids || to_jsonb(v_copy_id);
  END LOOP;

  RETURN v_inserted_ids;
END;
$function$;
DROP FUNCTION IF EXISTS public.insert_user_copies(uuid, jsonb);
CREATE FUNCTION public.insert_user_copies(
  p_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_default_location_id integer;
  v_inserted_ids jsonb;
BEGIN
  IF COALESCE(jsonb_array_length(p_rows), 0) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'inserted_count', 0,
      'inserted_ids', '[]'::jsonb
    );
  END IF;

  v_default_location_id := public._ensure_default_storage_location_id(p_user_id);
  v_inserted_ids := public._insert_user_copy_rows_with_ids(
    p_user_id,
    p_rows,
    v_default_location_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', jsonb_array_length(v_inserted_ids),
    'inserted_ids', v_inserted_ids
  );
END;
$function$;
REVOKE ALL ON FUNCTION public._insert_user_copy_rows_with_ids(uuid, jsonb, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.insert_user_copies(uuid, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_user_copies(uuid, jsonb) TO service_role;
