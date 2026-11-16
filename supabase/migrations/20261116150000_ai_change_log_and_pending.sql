-- APPLIED to live 2026-11-16 (owner approved; additive only). Task CC-04b (slice B, safe edits with undo).
-- Contract: docs/oracle/contracts/claude-connector-slice-b.md (sections 4 and 5).
-- ADDITIVE ONLY: two new tables, no change to any existing table. Reversible: rollback file
-- supabase/drafts/20261116150000_ai_change_log_and_pending.rollback.sql (drops the two empty-at-first tables).
-- Depends on: 20261116130000_connector_connections (applied). Apply BEFORE 20261116150100_ai_connector_edit_rpcs.sql.
--
-- ai_change_log     = the append-only "made by AI" record: one row per slot / copy that changed. A request that changes
--                     several cards shares one group_id (one Undo, all or nothing). Holds enough "before" and "after" to
--                     reverse the change (section 5 of the contract). Kept indefinitely; Undo is possible for 7 days.
-- ai_pending_changes = requests waiting for the owner's yes (big edits, and ANY card move between decks). Expire after 24 h.
--
-- Writes: service_role only (through the SECURITY DEFINER functions in the next migration). Owners may SELECT their own rows.
-- A Claude token (authenticated + client_id claim) can therefore read its own log, never write it, even through the table API.
-- Identifier notes (D-003): oracle_id columns hold an oracle_id (text, same type as user_cards.oracle_id);
-- printing_id columns hold a scryfall_id (a printing). The two are never interchanged. Finish is stored separately in
-- `before`/`after` JSON, never inside printing_id.

BEGIN;

-- ---------------------------------------------------------------------------------------------------------------
-- ai_pending_changes (created first: ai_change_log points at it)
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.ai_pending_changes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  connection_id    uuid        REFERENCES public.connector_connections (id) ON DELETE SET NULL,
  client_name      text        NOT NULL,
  kind             text        NOT NULL CHECK (kind IN ('big_edit', 'copy_move')),
  action           text        NOT NULL CHECK (action IN
                     ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move')),
  reason           text        NOT NULL CHECK (reason IN ('over_ten','recent_total','busy','card_move')),
  deck_id          integer     REFERENCES public.decks (id) ON DELETE SET NULL,   -- the deck that changes (move: the deck that LOSES the card)
  deck_name        text,
  other_deck_id    integer     REFERENCES public.decks (id) ON DELETE SET NULL,   -- move only: the deck that GAINS the card
  other_deck_name  text,
  card_count       integer     NOT NULL CHECK (card_count > 0),
  payload          jsonb       NOT NULL,   -- the validated request, ids resolved by the server; contains no user id
  payload_hash     text        NOT NULL,   -- md5(action || payload); blocks duplicate waiting requests
  preview          jsonb       NOT NULL,   -- cards list and per-deck before/after counts (size, sleeved, unsleeved_generics)
  status           text        NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting','approved','declined','expired','cancelled','failed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  decided_at       timestamptz,
  decided_via      text        CHECK (decided_via IN ('oracle_session')),   -- the only value; never a connector token
  result_group_id  uuid,                -- ai_change_log.group_id of the applied change, when approved
  failure_reason   jsonb,               -- when status = 'failed': {code, ...} from the stale check
  cancel_reason    text        CHECK (cancel_reason IN ('switched_off','connection_ended')),
  CONSTRAINT ai_pending_decided_consistent CHECK (status = 'waiting' OR decided_at IS NOT NULL)   -- every non-waiting row says when it ended
);

COMMENT ON TABLE public.ai_pending_changes IS
  'Requests from Claude that wait for the owner''s yes in Oracle. Created only by Claude''s tools; approved or declined only by a cookie-signed-in Oracle session.';
COMMENT ON COLUMN public.ai_pending_changes.deck_id IS 'decks.id. For copy_move this is the deck that loses the card.';

CREATE UNIQUE INDEX ai_pending_one_waiting_per_payload
  ON public.ai_pending_changes (user_id, payload_hash) WHERE status = 'waiting';
CREATE INDEX ai_pending_user_status_created
  ON public.ai_pending_changes (user_id, status, created_at DESC);
CREATE INDEX ai_pending_connection_waiting
  ON public.ai_pending_changes (connection_id) WHERE status = 'waiting';

ALTER TABLE public.ai_pending_changes ENABLE ROW LEVEL SECURITY;   -- never FORCE (definer functions must keep working)
CREATE POLICY ai_pending_changes_owner_select ON public.ai_pending_changes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.ai_pending_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_pending_changes TO authenticated;
GRANT ALL ON public.ai_pending_changes TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- ai_change_log
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.ai_change_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  group_id            uuid        NOT NULL,   -- one request = one group = one Undo (all or nothing)
  connection_id       uuid        REFERENCES public.connector_connections (id) ON DELETE SET NULL,
  client_name         text        NOT NULL,   -- snapshot, e.g. 'Claude'
  kind                text        NOT NULL CHECK (kind IN
                        ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move')),
  deck_id             integer     REFERENCES public.decks (id) ON DELETE SET NULL,   -- the deck that changed (move: the SOURCE deck)
  deck_name           text,                   -- snapshot, so the row reads correctly after a rename or delete
  other_deck_id       integer     REFERENCES public.decks (id) ON DELETE SET NULL,   -- move only: the DESTINATION deck
  other_deck_name     text,
  card_name           text        NOT NULL,
  oracle_id           text,                   -- oracle_id of the card (not a printing)
  printing_id         text,                   -- scryfall_id of the printing (not an oracle_id)
  deck_card_id        integer,                -- deck_cards.id; no FK, the slot may be deleted (move: source slot)
  other_deck_card_id  integer,                -- move only: destination slot
  copy_id             integer,                -- user_copies.id the change concerns; no FK. For collection_add / create_proxy this
                                              -- is THE ONE copy Claude created, the only copy Undo may ever remove
  before              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  after               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  pending_id          uuid        REFERENCES public.ai_pending_changes (id) ON DELETE SET NULL,
  approved_by_owner   boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  undoable_until      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  undone_at           timestamptz,
  undone_by           text        CHECK (undone_by IN ('owner','claude')),
  CONSTRAINT ai_change_log_undo_pair CHECK ((undone_at IS NULL) = (undone_by IS NULL))
);

COMMENT ON TABLE public.ai_change_log IS
  'Append-only record of every edit made through the Claude connector ("made by AI", D-009 / D-034). Only undone_at / undone_by may change after insert.';

CREATE INDEX ai_change_log_user_created ON public.ai_change_log (user_id, created_at DESC);
CREATE INDEX ai_change_log_user_group ON public.ai_change_log (user_id, group_id);
CREATE INDEX ai_change_log_user_deck_created ON public.ai_change_log (user_id, deck_id, created_at DESC);
CREATE INDEX ai_change_log_user_card_slot ON public.ai_change_log (user_id, deck_card_id) WHERE deck_card_id IS NOT NULL;
CREATE INDEX ai_change_log_user_copy ON public.ai_change_log (user_id, copy_id) WHERE copy_id IS NOT NULL;

ALTER TABLE public.ai_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_change_log_owner_select ON public.ai_change_log
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.ai_change_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_change_log TO authenticated;
GRANT ALL ON public.ai_change_log TO service_role;

-- Append-only guard: after insert, only undone_at / undone_by may be set (once). Deletes are left to the user cascade.
CREATE OR REPLACE FUNCTION public._ai_change_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'undone_at' - 'undone_by') IS DISTINCT FROM (to_jsonb(OLD) - 'undone_at' - 'undone_by') THEN
    RAISE EXCEPTION 'ai_change_log_is_append_only' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'ai_change_log_already_undone' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ai_change_log_guard BEFORE UPDATE ON public.ai_change_log
  FOR EACH ROW EXECUTE FUNCTION public._ai_change_log_guard();
REVOKE ALL ON FUNCTION public._ai_change_log_guard() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ROLLBACK: see 20261116150000_ai_change_log_and_pending.rollback.sql. It drops the two tables and the guard function.
-- WARNING: this destroys the "made by AI" history and any waiting requests. Do it only if the feature is being removed.
