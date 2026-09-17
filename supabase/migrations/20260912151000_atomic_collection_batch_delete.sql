-- Collection Foundation Phase 2/3: atomic batch copy deletion
--
-- A collection sync may intentionally remove several physical copies. Deleting
-- the copy rows in one RPC lets the FK clear any deck slots in the same
-- transaction instead of leaving a clear-then-delete crash window.

CREATE OR REPLACE FUNCTION public.delete_user_copies(
  p_copy_ids integer[],
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_id integer;
  v_requested_count integer := COALESCE(array_length(p_copy_ids, 1), 0);
  v_owned_count integer;
  v_deleted_count integer := 0;
BEGIN
  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'deleted_count', 0);
  END IF;

  IF (
    SELECT count(*) FROM unnest(p_copy_ids) AS ids(id)
  ) <> (
    SELECT count(DISTINCT id) FROM unnest(p_copy_ids) AS ids(id)
  ) THEN
    RAISE EXCEPTION 'duplicate_copy_id'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_copy_id IN
    SELECT id FROM unnest(p_copy_ids) AS ids(id) ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );
  END LOOP;

  SELECT count(*)
  INTO v_owned_count
  FROM user_copies
  WHERE id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  IF v_owned_count <> v_requested_count THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM user_copies
  WHERE id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.delete_user_copies(integer[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_copies(integer[], uuid) TO authenticated, service_role;
