-- Fix: compute_card_diff referenced v_new_card.card / v_old_card.card, but
-- jsonb_array_elements(...) AS card returns a column named `value` (the AS
-- aliases the table, not the column). This raised
-- record "v_new_card" has no field "card" whenever the diff path ran against a
-- non-empty snapshot, breaking deck version creation during import.
-- Corrected all references to use the actual `value` column.
CREATE OR REPLACE FUNCTION public.compute_card_diff(
  p_old_snapshot JSONB,
  p_new_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_added JSONB := '[]'::JSONB;
  v_removed JSONB := '[]'::JSONB;
  v_changed JSONB := '[]'::JSONB;
  v_old_card RECORD;
  v_new_card RECORD;
  v_old_map JSONB := '{}'::JSONB;
  v_new_map JSONB := '{}'::JSONB;
BEGIN
  -- Build maps keyed by card_name for comparison
  FOR v_old_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_old_snapshot, '[]'::JSONB)) AS card
  LOOP
    v_old_map := v_old_map || jsonb_build_object(v_old_card.value->>'card_name', v_old_card.value);
  END LOOP;

  FOR v_new_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_snapshot, '[]'::JSONB)) AS card
  LOOP
    v_new_map := v_new_map || jsonb_build_object(v_new_card.value->>'card_name', v_new_card.value);
  END LOOP;

  -- Find added cards (in new but not in old)
  FOR v_new_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_snapshot, '[]'::JSONB)) AS card
  LOOP
    IF NOT v_old_map ? (v_new_card.value->>'card_name') THEN
      v_added := v_added || jsonb_build_array(v_new_card.value->>'card_name');
    END IF;
  END LOOP;

  -- Find removed cards (in old but not in new)
  FOR v_old_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_old_snapshot, '[]'::JSONB)) AS card
  LOOP
    IF NOT v_new_map ? (v_old_card.value->>'card_name') THEN
      v_removed := v_removed || jsonb_build_array(v_old_card.value->>'card_name');
    END IF;
  END LOOP;

  -- Find changed cards (quantity or category changed)
  FOR v_new_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_snapshot, '[]'::JSONB)) AS card
  LOOP
    IF v_old_map ? (v_new_card.value->>'card_name') THEN
      DECLARE
        v_old_entry JSONB := v_old_map->(v_new_card.value->>'card_name');
      BEGIN
        IF (v_old_entry->>'quantity') IS DISTINCT FROM (v_new_card.value->>'quantity') OR
           (v_old_entry->>'categories') IS DISTINCT FROM (v_new_card.value->>'categories') THEN
          v_changed := v_changed || jsonb_build_array(v_new_card.value->>'card_name');
        END IF;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'added', v_added,
    'removed', v_removed,
    'changed', v_changed,
    'added_count', jsonb_array_length(v_added),
    'removed_count', jsonb_array_length(v_removed),
    'changed_count', jsonb_array_length(v_changed)
  );
END;
$$;;
