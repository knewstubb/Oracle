ALTER TABLE physical_copies ADD COLUMN IF NOT EXISTS missing BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_physical_copies_missing ON physical_copies(missing) WHERE missing = true;

ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_ownership_status_check;

ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_ownership_status_check CHECK (ownership_status IS NULL OR ownership_status IN ('original', 'proxy', 'generic'));

UPDATE deck_cards SET ownership_status = NULL WHERE ownership_status = 'not_owned';

CREATE OR REPLACE FUNCTION batch_assign_deck(p_assignments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE deck_cards
  SET physical_copy_id = NULL,
      ownership_status = NULL
  WHERE id IN (
    SELECT (a->>'clear_deck_cards_id')::bigint
    FROM jsonb_array_elements(p_assignments) AS a
    WHERE a->>'clear_deck_cards_id' IS NOT NULL
  );

  UPDATE deck_cards dc
  SET
    physical_copy_id = (a->>'physical_copy_id')::bigint,
    ownership_status = a->>'ownership_status'
  FROM (
    SELECT
      (elem->>'deck_cards_id')::bigint AS deck_cards_id,
      (elem->>'physical_copy_id')::bigint AS physical_copy_id,
      elem->>'ownership_status' AS ownership_status
    FROM jsonb_array_elements(p_assignments) AS elem
  ) a
  WHERE dc.id = a.deck_cards_id;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_assign_deck(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_assign_deck(jsonb) TO service_role;;
