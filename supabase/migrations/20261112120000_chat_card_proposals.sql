-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves.
-- Contract: docs/oracle/contracts/chat-add-cards.md (section 3.1, slices 1 and 2).
--
-- Adds ONE new table, chat_card_proposals, and TWO functions:
--   confirm_chat_card_proposals : adds proposed cards as planned slots (one transaction, deck row locked)
--   undo_chat_card_proposals    : removes exactly the slots a proposal added, only if still unchanged
--
-- Safety: additive only. CREATE TABLE / INDEX / POLICY / FUNCTION. No DROP, TRUNCATE or UPDATE of existing data.
-- Nothing in an existing table changes. The functions only touch deck_cards rows they insert themselves
-- (and delete again on undo); they never create, assign or move a physical copy (D-020, D-025).
-- Reversible: DROP FUNCTION both functions, then DROP TABLE public.chat_card_proposals (it holds only proposals).
-- Rows go away with their deck (ON DELETE CASCADE).
-- Writes happen only through the service role, called by the confirm/undo routes after the owner is
-- signed in (same pattern as apply_ai_deck_delta). The model has no path to these functions.

CREATE TABLE IF NOT EXISTS public.chat_card_proposals (
  -- The id doubles as the single-use confirmation token. Created by the server, shown only to the owner's browser.
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid    NOT NULL,
  deck_id               integer NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  -- Canonical card id (D-003). Null only for a name that matched no card (status 'blocked').
  oracle_id             text,
  card_name             text    NOT NULL,
  category              text,
  reason                text,
  status                text    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'added', 'dismissed', 'undone', 'blocked', 'expired')),
  blocked_reason        text,
  -- The slot this proposal created (a deck_cards id, not a card id). No foreign key: undo must still work
  -- after the owner removed the slot, and the audit row must outlive it.
  created_deck_card_id  integer,
  -- The categories text written on that slot, so undo can tell whether the slot was changed since.
  created_categories    text,
  -- Who made the change. Always 'ai' for rows created here (D-009, D-034).
  source                text    NOT NULL DEFAULT 'ai' CHECK (source IN ('ai')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  confirmed_at          timestamptz,
  undone_at             timestamptz
);

CREATE INDEX IF NOT EXISTS chat_card_proposals_user_deck_status
  ON public.chat_card_proposals (user_id, deck_id, status);

ALTER TABLE public.chat_card_proposals ENABLE ROW LEVEL SECURITY;

-- Owner reads own rows. Writes use the service role with explicit user_id checks.
CREATE POLICY chat_card_proposals_select_own ON public.chat_card_proposals
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.chat_card_proposals IS
  'Cards the Oracle chat proposed for a deck. Nothing is added until the owner clicks Add. Audit of every chat add. Contract: docs/oracle/contracts/chat-add-cards.md';

-- ---------------------------------------------------------------------------
-- confirm_chat_card_proposals
-- p_items: [{ proposal_id, card_name, scryfall_id, categories }] already re-checked by the route
-- (real card, colours, legality). This function re-checks what only the database can check without a race:
-- the proposal is still pending, belongs to this user and deck, has not expired, and the card is not already
-- on the main list. A card that fails is skipped; the rest are added in the same transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_chat_card_proposals(
  p_user_id uuid,
  p_deck_id integer,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item record;
  v_prop record;
  v_new_id integer;
  v_added jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_basics text[] := ARRAY[
    'plains','island','swamp','mountain','forest',
    'snow-covered plains','snow-covered island','snow-covered swamp','snow-covered mountain','snow-covered forest',
    'wastes'
  ];
BEGIN
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb))
      AS rows(proposal_id uuid, card_name text, scryfall_id text, categories text)
  LOOP
    SELECT * INTO v_prop
    FROM chat_card_proposals
    WHERE id = v_item.proposal_id AND user_id = p_user_id AND deck_id = p_deck_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('proposal_id', v_item.proposal_id, 'reason', 'unknown');
      CONTINUE;
    END IF;
    IF v_prop.status <> 'pending' THEN
      v_skipped := v_skipped || jsonb_build_object('proposal_id', v_item.proposal_id, 'reason', 'used');
      CONTINUE;
    END IF;
    IF v_prop.expires_at <= now() THEN
      UPDATE chat_card_proposals SET status = 'expired' WHERE id = v_prop.id;
      v_skipped := v_skipped || jsonb_build_object('proposal_id', v_item.proposal_id, 'reason', 'expired');
      CONTINUE;
    END IF;

    IF NOT (lower(v_item.card_name) = ANY (v_basics)) AND EXISTS (
      SELECT 1 FROM deck_cards dc
      WHERE dc.deck_id = p_deck_id AND dc.user_id = p_user_id
        AND lower(split_part(dc.card_name, ' // ', 1)) = lower(split_part(v_item.card_name, ' // ', 1))
    ) THEN
      UPDATE chat_card_proposals SET status = 'blocked', blocked_reason = 'in_deck' WHERE id = v_prop.id;
      v_skipped := v_skipped || jsonb_build_object('proposal_id', v_item.proposal_id, 'reason', 'in_deck');
      CONTINUE;
    END IF;

    INSERT INTO deck_cards (
      deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id, copy_id, ownership_status
    )
    VALUES (
      p_deck_id, v_item.card_name, v_item.scryfall_id, NULL, 1, v_item.categories, false, p_user_id, NULL, NULL
    )
    RETURNING id INTO v_new_id;

    UPDATE chat_card_proposals
    SET status = 'added', created_deck_card_id = v_new_id, created_categories = v_item.categories, confirmed_at = now()
    WHERE id = v_prop.id;

    v_added := v_added || jsonb_build_object('proposal_id', v_item.proposal_id, 'deck_card_id', v_new_id);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'added', v_added, 'skipped', v_skipped);
END;
$function$;

-- ---------------------------------------------------------------------------
-- undo_chat_card_proposals
-- Removes exactly the slot a proposal created, and only while it is still a plain planned slot
-- (no copy assigned, no ownership status, same categories). Otherwise it refuses and changes nothing.
-- A slot the owner already removed counts as undone. Never moves a copy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_chat_card_proposals(
  p_user_id uuid,
  p_deck_id integer,
  p_proposal_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id uuid;
  v_prop record;
  v_slot record;
  v_undone jsonb := '[]'::jsonb;
  v_refused jsonb := '[]'::jsonb;
BEGIN
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_proposal_ids, ARRAY[]::uuid[])
  LOOP
    SELECT * INTO v_prop
    FROM chat_card_proposals
    WHERE id = v_id AND user_id = p_user_id AND deck_id = p_deck_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_refused := v_refused || jsonb_build_object('proposal_id', v_id, 'reason', 'unknown');
      CONTINUE;
    END IF;
    IF v_prop.status <> 'added' THEN
      v_refused := v_refused || jsonb_build_object('proposal_id', v_id, 'reason', 'not_added');
      CONTINUE;
    END IF;
    IF v_prop.confirmed_at IS NOT NULL AND v_prop.expires_at <= now() THEN
      v_refused := v_refused || jsonb_build_object('proposal_id', v_id, 'reason', 'expired');
      CONTINUE;
    END IF;

    SELECT * INTO v_slot
    FROM deck_cards
    WHERE id = v_prop.created_deck_card_id AND deck_id = p_deck_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      UPDATE chat_card_proposals SET status = 'undone', undone_at = now() WHERE id = v_prop.id;
      v_undone := v_undone || to_jsonb(v_id);
      CONTINUE;
    END IF;

    IF v_slot.copy_id IS NOT NULL
       OR v_slot.ownership_status IS NOT NULL
       OR v_slot.categories IS DISTINCT FROM v_prop.created_categories THEN
      v_refused := v_refused || jsonb_build_object('proposal_id', v_id, 'reason', 'changed');
      CONTINUE;
    END IF;

    DELETE FROM deck_cards WHERE id = v_slot.id AND deck_id = p_deck_id AND user_id = p_user_id;
    UPDATE chat_card_proposals SET status = 'undone', undone_at = now() WHERE id = v_prop.id;
    v_undone := v_undone || to_jsonb(v_id);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'undone', v_undone, 'refused', v_refused);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_chat_card_proposals(uuid, integer, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.undo_chat_card_proposals(uuid, integer, uuid[]) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_chat_card_proposals(uuid, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_chat_card_proposals(uuid, integer, uuid[]) TO service_role;
