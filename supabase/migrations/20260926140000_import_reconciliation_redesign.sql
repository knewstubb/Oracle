-- Migration applied 2026-09-27.
--
-- Task T-22/T-24: import reconciliation redesign.
-- Contract: docs/oracle/contracts/import-reconciliation-redesign.md
-- UX spec:  docs/oracle/specs/import-reconciliation-redesign.md
--
-- WHAT THIS DOES
--
-- The reconciliation screen moves from a per-card action model to a
-- per-instance state model grouped by conflict printing. Three things in the
-- current schema cannot express that:
--
--   1. `get_import_allocations` groups by card_name and counts `owned` across
--      every printing. The redesign groups by (card_name, printing_id) and
--      `owned` means "copies of THAT printing" (spec section 5). D-021/D-024
--      make printing identity load-bearing.
--   2. Claims have no per-instance printing override, so the alternate-printing
--      selector (spec section 12) has nowhere to store its choice.
--   3. Claims default to `resolution = 'sleeve'`, and `release` no longer means
--      "release" — it means "the slot stays Planned". The redesign's default is
--      Planned for every instance.
--
-- Everything else is kept: the claims table, batch scoping, `settled_at` as the
-- durable record behind the cross-page badge, and a single materialisation pass
-- on "Go to Decks".
--
-- DEPLOYMENT SEQUENCING — READ THIS
--
-- Changing the default state to 'planned' means a freshly imported batch has no
-- sleeve intent recorded until the user chooses it. The OLD summary screen
-- derives its conflict list from sleeve intent, so between this migration and
-- the new reconciliation UI the old screen will show no conflicts. That is a
-- display consequence, not data loss: every claim row, printing and deck slot is
-- preserved and the new screen renders them all. Apply this migration together
-- with the new UI.
--
-- SAFETY
--
-- No table, column, constraint, index or row is dropped. No TRUNCATE, no
-- DELETE, no destructive recompute. The only row writes are two value renames on
-- `import_sleeve_claims.resolution`, which are reversible (see bottom of file).
--
-- All functions here are SECURITY DEFINER with `SET search_path = public` and an
-- explicit `p_user_id` ownership predicate on every statement. Functions that
-- already exist are CREATE OR REPLACE, which preserves their current grants and
-- creates no intermediate privilege window. The four NEW functions are granted
-- to `service_role` only, because the application reaches them exclusively
-- through `createAdminClient()` [Confirmed: src/lib/import-sleeve-claims.ts].

-- ===========================================================================
-- 1. New columns on import_sleeve_claims
-- ===========================================================================

-- selected_printing_id: the per-instance alternate-printing override (spec
-- section 12). NULL means "use the imported printing". `printing_id` is never
-- overwritten, so the select's default option is always recoverable.
--
-- wishlist: the per-instance wishlist toggle for unowned cards, checked by
-- default (spec section 9). Stored on the claim rather than in a new table
-- because the standalone wishlist list is explicitly deferred (spec section 18);
-- a table with no consumer is debt. Wishlist state affects no count, no
-- resolution and no deck membership.
ALTER TABLE public.import_sleeve_claims
  ADD COLUMN IF NOT EXISTS selected_printing_id text,
  ADD COLUMN IF NOT EXISTS wishlist boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.import_sleeve_claims.selected_printing_id IS
  'Per-instance alternate-printing override (scryfall_id). NULL = use printing_id. Must share the imported printing''s oracle_id and be owned (D-003).';
COMMENT ON COLUMN public.import_sleeve_claims.wishlist IS
  'Per-instance wishlist toggle for unowned cards. Default true. Never affects deck membership or supply.';

-- ===========================================================================
-- 2. Rename the resolution value set
--
--   release -> planned   (the slot stays planned; nothing is released)
--   sleeve  -> sleeved   (the slot takes a real copy of the effective printing)
--   proxy   -> proxy     (unchanged)
--
-- Renaming rather than translating in the API layer: `release` actively
-- misdescribes what it does, and a permanent spec/UI/DB translation layer is how
-- the scryfall_id-vs-oracle_id class of bug happens (D-003's lesson). Legacy
-- strings stay accepted on input at the RPC boundary (section 5) so a cached
-- client cannot corrupt state.
-- ===========================================================================

ALTER TABLE public.import_sleeve_claims
  DROP CONSTRAINT IF EXISTS import_sleeve_claims_resolution_check;

ALTER TABLE public.import_sleeve_claims
  ALTER COLUMN resolution DROP DEFAULT;

UPDATE public.import_sleeve_claims SET resolution = 'planned' WHERE resolution = 'release';
UPDATE public.import_sleeve_claims SET resolution = 'sleeved' WHERE resolution = 'sleeve';

ALTER TABLE public.import_sleeve_claims
  ALTER COLUMN resolution SET DEFAULT 'planned';

ALTER TABLE public.import_sleeve_claims
  ADD CONSTRAINT import_sleeve_claims_resolution_check
  CHECK (resolution IN ('planned', 'sleeved', 'proxy'));

COMMENT ON COLUMN public.import_sleeve_claims.resolution IS
  'Per-instance state: planned (default) | sleeved | proxy. Pre-T-22 values release/sleeve were renamed to planned/sleeved.';

-- Reconciliation reads are keyed by (user, batch, card, printing).
CREATE INDEX IF NOT EXISTS idx_import_sleeve_claims_user_batch_printing
  ON public.import_sleeve_claims (user_id, batch_id, card_name, printing_id);

-- ===========================================================================
-- 3. get_import_reconciliation — the single read for the redesigned screen
--
-- Returns the whole view in one call: rows (one per conflict printing), the
-- instances inside each row, per-instance supply flags, alternate printings,
-- deck headers, and every tab count.
--
-- The client derives NO supply maths. `canSleeve` and `alreadyClaimed` are
-- computed here from one consistent snapshot, so two tabs can never disagree.
--
-- Scope: claims in the batch (or unsettled claims with no batch) whose
-- deck_cards row still has copy_id IS NULL. Slots that `reconcile_built_deck`
-- already filled at import time are NOT rows — they are supply consumers and
-- appear as `claimedBy` deck tags instead (contract section 2.5).
--
-- p_include_resolved defaults to false, which is what makes resolved printings
-- disappear on a full reload (spec section 14). Mutations call this with true so
-- a row the user just resolved stays on screen, green and still editable.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_import_reconciliation(
  p_user_id          uuid,
  p_batch_id         uuid    DEFAULT NULL,
  p_include_resolved boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH scope AS (
    SELECT c.id                                                           AS claim_id,
           c.deck_id,
           c.deck_cards_id,
           c.card_name,
           c.printing_id                                                  AS imported_printing_id,
           COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id)
                                                                          AS effective_printing_id,
           NULLIF(btrim(c.selected_printing_id), '')                      AS selected_printing_id,
           c.resolution,
           c.wishlist
    FROM public.import_sleeve_claims c
    JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
    WHERE c.user_id = p_user_id
      AND dc.user_id = p_user_id
      AND dc.copy_id IS NULL
      AND c.printing_id IS NOT NULL
      AND btrim(c.printing_id) <> ''
      AND CASE
            WHEN p_batch_id IS NOT NULL THEN c.batch_id = p_batch_id
            ELSE c.settled_at IS NULL
          END
  ),
  scope_cards AS (
    SELECT DISTINCT card_name FROM scope
  ),

  -- Every real (non-proxy, non-missing) copy of every card on this screen, with
  -- the deck slot currently holding it (NULL = free).
  real_copies AS (
    SELECT ucard.card_name,
           uc.printing_id,
           uc.id          AS copy_id,
           uc.finish,
           held.id        AS held_slot_id,
           held.deck_id   AS held_deck_id
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    JOIN scope_cards sc          ON sc.card_name = ucard.card_name
    LEFT JOIN public.deck_cards held ON held.copy_id = uc.id
    WHERE uc.user_id = p_user_id
      AND uc.is_proxy = false
      AND COALESCE(uc.missing, false) = false
  ),
  owned_any AS (
    SELECT card_name, count(*)::int AS owned_any
    FROM real_copies
    GROUP BY card_name
  ),
  printing_supply AS (
    SELECT card_name,
           printing_id,
           count(*)::int                                          AS owned_total,
           count(*) FILTER (WHERE held_slot_id IS NULL)::int       AS available_supply,
           COALESCE(
             jsonb_agg(DISTINCT finish) FILTER (WHERE finish IS NOT NULL),
             '[]'::jsonb
           )                                                      AS finishes,
           count(DISTINCT finish)::int                             AS finish_variants,
           min(finish)                                             AS sample_finish
    FROM real_copies
    WHERE printing_id IS NOT NULL
    GROUP BY card_name, printing_id
  ),
  printing_claimed_by AS (
    SELECT rc.card_name,
           rc.printing_id,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
             'deckId', d.id, 'deckName', d.name
           )), '[]'::jsonb) AS claimed_by
    FROM real_copies rc
    JOIN public.decks d ON d.id = rc.held_deck_id
    WHERE rc.held_slot_id IS NOT NULL
      AND rc.printing_id IS NOT NULL
    GROUP BY rc.card_name, rc.printing_id
  ),
  printing_proxies AS (
    SELECT ucard.card_name,
           uc.printing_id,
           count(*) FILTER (WHERE held.id IS NULL)::int AS free_proxies
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    JOIN scope_cards sc          ON sc.card_name = ucard.card_name
    LEFT JOIN public.deck_cards held ON held.copy_id = uc.id
    WHERE uc.user_id = p_user_id
      AND uc.is_proxy = true
      AND COALESCE(uc.missing, false) = false
      AND uc.printing_id IS NOT NULL
    GROUP BY ucard.card_name, uc.printing_id
  ),

  -- Sleeve intent is counted on the EFFECTIVE printing, across the whole scope:
  -- two instances in different rows can select the same alternate printing.
  printing_demand AS (
    SELECT card_name,
           effective_printing_id AS printing_id,
           count(*) FILTER (WHERE resolution = 'sleeved')::int AS sleeved_intent
    FROM scope
    GROUP BY card_name, effective_printing_id
  ),

  -- Room on a printing means available_supply > sleeved_intent. A planned
  -- instance is unresolved while ANY owned printing of the card still has room
  -- (the user could sleeve or switch printing); it is resolved only when every
  -- owned printing has lost the allocation race (contract section 5).
  printing_room AS (
    SELECT ps.card_name,
           ps.printing_id,
           (ps.available_supply > COALESCE(pd.sleeved_intent, 0)) AS has_room
    FROM printing_supply ps
    LEFT JOIN printing_demand pd ON pd.card_name = ps.card_name
                                AND pd.printing_id = ps.printing_id
  ),
  instance_room_anywhere AS (
    SELECT s.claim_id,
           COALESCE(bool_or(pr.has_room), false) AS has_room_anywhere
    FROM scope s
    LEFT JOIN printing_room pr ON pr.card_name = s.card_name AND pr.has_room
    GROUP BY s.claim_id
  ),

  instances AS (
    SELECT s.*,
           d.name                                AS deck_name,
           COALESCE(eps.owned_total, 0)          AS eff_owned,
           COALESCE(eps.available_supply, 0)     AS eff_available,
           COALESCE(pdm.sleeved_intent, 0)       AS eff_sleeved_intent,
           COALESCE(ecb.claimed_by, '[]'::jsonb) AS eff_claimed_by
    FROM scope s
    JOIN public.decks d ON d.id = s.deck_id
    LEFT JOIN printing_supply     eps ON eps.card_name = s.card_name
                                     AND eps.printing_id = s.effective_printing_id
    LEFT JOIN printing_demand     pdm ON pdm.card_name = s.card_name
                                     AND pdm.printing_id = s.effective_printing_id
    LEFT JOIN printing_claimed_by ecb ON ecb.card_name = s.card_name
                                     AND ecb.printing_id = s.effective_printing_id
  ),
  instance_flags AS (
    SELECT i.*,
           -- An instance already holding a sleeve slot keeps it only while the
           -- whole sleeved set fits; otherwise every sleeved instance on that
           -- printing is flagged, because there is no tie-breaker (spec 8.2).
           CASE
             WHEN i.resolution = 'sleeved'
               THEN i.eff_sleeved_intent <= i.eff_available
             ELSE i.eff_sleeved_intent < i.eff_available
           END AS can_sleeve,
           (i.resolution = 'sleeved' AND i.eff_sleeved_intent > i.eff_available)
             AS sleeve_unsatisfiable,
           -- Slot-level resolved per contract section 5.
           CASE
             WHEN i.resolution = 'proxy' THEN true
             WHEN i.resolution = 'sleeved' THEN
               i.eff_sleeved_intent <= i.eff_available
             WHEN i.resolution = 'planned' THEN
               NOT COALESCE(ira.has_room_anywhere, false)
           END AS instance_resolved
    FROM instances i
    LEFT JOIN instance_room_anywhere ira ON ira.claim_id = i.claim_id
  ),
  instance_display AS (
    SELECT f.*,
           -- "Already claimed" (spec 8.1): the user owns this printing, but no
           -- copy is available to this instance. Not shown when the printing is
           -- simply not owned — that is `printingMismatch`, a different story.
           (NOT f.can_sleeve AND f.resolution <> 'sleeved' AND f.eff_owned > 0)
             AS already_claimed
    FROM instance_flags f
  ),

  row_keys AS (
    SELECT DISTINCT card_name, imported_printing_id FROM instance_display
  ),
  row_progress AS (
    SELECT card_name,
           imported_printing_id,
           count(*)::int                              AS instance_count,
           bool_and(instance_resolved)                AS row_resolved,
           bool_or(sleeve_unsatisfiable)              AS has_unsatisfiable_sleeve,
           bool_or(already_claimed)                   AS has_already_claimed
    FROM instance_display
    GROUP BY card_name, imported_printing_id
  ),
  row_meta AS (
    SELECT rk.card_name,
           rk.imported_printing_id,
           COALESCE(oa.owned_any, 0)              AS owned_any,
           COALESCE(ps.owned_total, 0)            AS owned_total,
           COALESCE(ps.available_supply, 0)       AS available_supply,
           -- Finish is a property of the physical copy (D-004) and is not part
           -- of the row key. Report it only when it is unambiguous.
           CASE WHEN COALESCE(ps.finish_variants, 0) = 1
                THEN ps.sample_finish ELSE NULL END AS finish,
           COALESCE(pcb.claimed_by, '[]'::jsonb)  AS claimed_by,
           COALESCE(pp.free_proxies, 0)           AS free_proxies,
           rp.oracle_id,
           rp.set_code,
           rp.set_name,
           rp.collector_number,
           rp.image_uri_small,
           rp.image_uri_normal,
           rp.image_uri_large
    FROM row_keys rk
    LEFT JOIN owned_any           oa  ON oa.card_name = rk.card_name
    LEFT JOIN printing_supply     ps  ON ps.card_name = rk.card_name
                                     AND ps.printing_id = rk.imported_printing_id
    LEFT JOIN printing_claimed_by pcb ON pcb.card_name = rk.card_name
                                     AND pcb.printing_id = rk.imported_printing_id
    LEFT JOIN printing_proxies    pp  ON pp.card_name = rk.card_name
                                     AND pp.printing_id = rk.imported_printing_id
    LEFT JOIN public.ref_printings rp ON rp.scryfall_id::text = rk.imported_printing_id
  ),
  row_flags AS (
    SELECT rm.*,
           rpg.instance_count,
           -- Printing-level resolved: every instance in the row is slot-level
           -- resolved (contract section 5).
           COALESCE(rpg.row_resolved, true)           AS resolved,
           (COALESCE(rpg.has_unsatisfiable_sleeve, false)
            OR COALESCE(rpg.has_already_claimed, false))           AS over_allocated,
           CASE WHEN rm.owned_any = 0 THEN 'unowned' ELSE 'owned' END AS ownership,
           -- D-024: owned, but not in the printing the deck asked for.
           (rm.owned_any > 0 AND rm.owned_total = 0)               AS printing_mismatch
    FROM row_meta rm
    JOIN row_progress rpg ON rpg.card_name = rm.card_name
                         AND rpg.imported_printing_id = rm.imported_printing_id
  ),
  rows_built AS (
    SELECT rf.card_name,
           rf.imported_printing_id,
           rf.resolved,
           rf.over_allocated,
           jsonb_build_object(
             'cardName',           rf.card_name,
             'printingId',         rf.imported_printing_id,
             'oracleId',           rf.oracle_id,
             'setCode',            rf.set_code,
             'setName',            rf.set_name,
             'collectorNumber',    rf.collector_number,
             'finish',             rf.finish,
             'imageUriSmall',      rf.image_uri_small,
             'imageUriNormal',     rf.image_uri_normal,
             'imageUriLarge',      rf.image_uri_large,
             'owned',              rf.owned_total,
             'availableSupply',    rf.available_supply,
             'ownedAnyPrinting',   rf.owned_any,
             'freeProxies',        rf.free_proxies,
             'claimedBy',          rf.claimed_by,
             'ownership',          rf.ownership,
             'printingMismatch',   rf.printing_mismatch,
             'overAllocated',      rf.over_allocated,
             'resolved',           rf.resolved,
             'instances', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'claimId',             f.claim_id,
                        'deckCardsId',         f.deck_cards_id,
                        'deckId',              f.deck_id,
                        'deckName',            f.deck_name,
                        'state',               f.resolution,
                        'selectedPrintingId',  f.selected_printing_id,
                        'effectivePrintingId', f.effective_printing_id,
                         'wishlisted',          f.wishlist,
                         'canSleeve',           f.can_sleeve,
                         'alreadyClaimed',      f.already_claimed,
                         'resolved',            f.instance_resolved,
                         'claimedBy',           f.eff_claimed_by
                       ) ORDER BY f.deck_name, f.claim_id), '[]'::jsonb)
               FROM instance_display f
               WHERE f.card_name = rf.card_name
                 AND f.imported_printing_id = rf.imported_printing_id
             ),
             -- Other printings of this card the user owns a real copy of.
             -- Empty => the UI hides the "Use alternate printing" select.
             'alternatePrintings', (
               SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'printingId',      a.printing_id,
                        'setCode',         arp.set_code,
                        'setName',         arp.set_name,
                        'collectorNumber', arp.collector_number,
                        'finishes',        a.finishes,
                        'owned',           a.owned_total,
                        'availableSupply', a.available_supply,
                        'imageUriSmall',   arp.image_uri_small
                      ) ORDER BY arp.set_code NULLS LAST,
                                 arp.collector_number NULLS LAST,
                                 a.printing_id), '[]'::jsonb)
               FROM printing_supply a
               LEFT JOIN public.ref_printings arp
                      ON arp.scryfall_id::text = a.printing_id
               WHERE a.card_name = rf.card_name
                 AND a.printing_id <> rf.imported_printing_id
             )
           ) AS row_json
    FROM row_flags rf
  ),
  -- Every deck with an in-scope instance, so a deck does not vanish mid-session
  -- when its last row resolves (spec section 14). The client hides decks with no
  -- rows left in the payload.
  decks_built AS (
    SELECT f.deck_id,
           f.deck_name,
           COALESCE(dk.is_active, false) AS is_active,
           count(DISTINCT CASE
                   WHEN NOT rf.resolved
                   THEN f.card_name || '|' || f.imported_printing_id
                 END)::int AS conflict_printing_count
    FROM instance_display f
    JOIN row_flags rf ON rf.card_name = f.card_name
                     AND rf.imported_printing_id = f.imported_printing_id
    JOIN public.decks dk ON dk.id = f.deck_id
    GROUP BY f.deck_id, f.deck_name, dk.is_active
  )
  SELECT jsonb_build_object(
    'success', true,
    'batchId', p_batch_id,
    'counts', jsonb_build_object(
      'unresolvedTotal',   (SELECT count(*)::int FROM row_flags WHERE NOT resolved),
      'unresolvedOwned',   (SELECT count(*)::int FROM row_flags
                             WHERE NOT resolved AND ownership = 'owned'),
      'unresolvedUnowned', (SELECT count(*)::int FROM row_flags
                             WHERE NOT resolved AND ownership = 'unowned'),
      'rowsTotal',         (SELECT count(*)::int FROM row_flags)
    ),
    'decks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'deckId',                db.deck_id,
               'deckName',              db.deck_name,
               'isActive',              db.is_active,
               'conflictPrintingCount', db.conflict_printing_count
             ) ORDER BY db.deck_name, db.deck_id), '[]'::jsonb)
      FROM decks_built db
    ),
    'rows', (
      SELECT COALESCE(jsonb_agg(rb.row_json
               ORDER BY rb.resolved,
                        rb.over_allocated DESC,
                        rb.card_name,
                        rb.imported_printing_id), '[]'::jsonb)
      FROM rows_built rb
      WHERE p_include_resolved OR NOT rb.resolved
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_import_reconciliation(uuid, uuid, boolean) IS
  'T-22 single read for the redesigned import reconciliation screen. Rows are conflict printings (card_name, printing_id); supply flags are server-computed. p_include_resolved=false is the reload behaviour.';

-- ===========================================================================
-- 4. set_import_claim_state — one instance's state
--
-- Fail-closed on supply: rejects `sleeved` when the effective printing has no
-- room. The UI already disables the button (spec 8.2); this re-check exists
-- because the invariant "never more sleeved instances than copies owned" must
-- hold even against a stale client. There is no tie-breaker to fall back on.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_import_claim_state(
  p_user_id  uuid,
  p_claim_id integer,
  p_state    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state       text;
  v_claim_id    integer;
  v_card        text;
  v_printing    text;
  v_current     text;
  v_batch       uuid;
  v_available   integer;
  v_sleeved     integer;
BEGIN
  -- Accept the pre-T-22 vocabulary so a cached client cannot corrupt state.
  v_state := CASE lower(btrim(COALESCE(p_state, '')))
               WHEN 'planned' THEN 'planned'
               WHEN 'release' THEN 'planned'
               WHEN 'sleeved' THEN 'sleeved'
               WHEN 'sleeve'  THEN 'sleeved'
               WHEN 'proxy'   THEN 'proxy'
               ELSE NULL
             END;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'invalid_state: %', p_state USING ERRCODE = 'P0001';
  END IF;

  SELECT c.id,
         c.card_name,
         COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id),
         c.resolution,
         c.batch_id
  INTO v_claim_id, v_card, v_printing, v_current, v_batch
  FROM public.import_sleeve_claims c
  WHERE c.id = p_claim_id AND c.user_id = p_user_id
  FOR UPDATE;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_state = 'sleeved' AND v_current <> 'sleeved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('import-card:' || v_card, 0));

    SELECT count(*)::int INTO v_available
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id
      AND ucard.card_name = v_card
      AND uc.printing_id IS NOT DISTINCT FROM v_printing
      AND uc.is_proxy = false
      AND COALESCE(uc.missing, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.deck_cards held WHERE held.copy_id = uc.id
      );

    SELECT count(*)::int INTO v_sleeved
    FROM public.import_sleeve_claims c
    JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
    WHERE c.user_id = p_user_id
      AND c.card_name = v_card
      AND c.resolution = 'sleeved'
      AND dc.copy_id IS NULL
      AND COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id)
            IS NOT DISTINCT FROM v_printing
      AND CASE
            WHEN v_batch IS NOT NULL THEN c.batch_id = v_batch
            ELSE c.settled_at IS NULL
          END;

    IF v_sleeved >= v_available THEN
      RAISE EXCEPTION 'sleeve_supply_exhausted' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.import_sleeve_claims
  SET resolution = v_state
  WHERE id = p_claim_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',   true,
    'claim_id',  p_claim_id,
    'card_name', v_card,
    'state',     v_state
  );
END;
$function$;

COMMENT ON FUNCTION public.set_import_claim_state(uuid, integer, text) IS
  'T-22: set one import instance to planned | sleeved | proxy. Rejects sleeved when the effective printing has no free copy. Accepts legacy release/sleeve.';

-- ===========================================================================
-- 5. set_import_claim_printing — one instance's alternate printing
--
-- p_printing_id NULL (or equal to the imported printing) clears the override.
--
-- Validation is fail-closed: the target must exist in ref_printings, share the
-- imported printing's oracle_id (D-003 — an alternate printing is a different
-- scryfall_id for the SAME card, never a different card), and be a printing the
-- user owns a real copy of (spec section 12: only owned cards can use alternate
-- printings; proxies do not qualify).
--
-- Demotion rather than rejection: if the instance was `sleeved` and the newly
-- chosen printing has no room, the instance drops to `planned` and the caller is
-- told. Rejecting the printing change would trap the user, and spec section 12
-- says alternate-printing selection never blocks.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_import_claim_printing(
  p_user_id     uuid,
  p_claim_id    integer,
  p_printing_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target        text;
  v_claim_id      integer;
  v_card          text;
  v_imported      text;
  v_current       text;
  v_batch         uuid;
  v_target_oracle uuid;
  v_source_oracle uuid;
  v_effective     text;
  v_available     integer;
  v_sleeved       integer;
  v_new_state     text;
  v_demoted       boolean := false;
BEGIN
  v_target := NULLIF(btrim(COALESCE(p_printing_id, '')), '');

  SELECT c.id, c.card_name, c.printing_id, c.resolution, c.batch_id
  INTO v_claim_id, v_card, v_imported, v_current, v_batch
  FROM public.import_sleeve_claims c
  WHERE c.id = p_claim_id AND c.user_id = p_user_id
  FOR UPDATE;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_target IS NOT NULL AND v_target <> COALESCE(v_imported, '') THEN
    SELECT rp.oracle_id INTO v_target_oracle
    FROM public.ref_printings rp
    WHERE rp.scryfall_id::text = v_target
    LIMIT 1;

    IF v_target_oracle IS NULL THEN
      RAISE EXCEPTION 'printing_not_found: %', v_target USING ERRCODE = 'P0001';
    END IF;

    SELECT rp.oracle_id INTO v_source_oracle
    FROM public.ref_printings rp
    WHERE rp.scryfall_id::text = btrim(COALESCE(v_imported, ''))
    LIMIT 1;

    IF v_source_oracle IS NOT NULL AND v_source_oracle <> v_target_oracle THEN
      RAISE EXCEPTION 'printing_not_same_card' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.user_copies uc
      JOIN public.user_cards ucard ON ucard.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND ucard.card_name = v_card
        AND uc.printing_id = v_target
        AND uc.is_proxy = false
        AND COALESCE(uc.missing, false) = false
    ) THEN
      RAISE EXCEPTION 'printing_not_owned: %', v_target USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_effective := COALESCE(v_target, v_imported);
  v_new_state := v_current;

  IF v_current = 'sleeved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('import-card:' || v_card, 0));

    SELECT count(*)::int INTO v_available
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id
      AND ucard.card_name = v_card
      AND uc.printing_id IS NOT DISTINCT FROM v_effective
      AND uc.is_proxy = false
      AND COALESCE(uc.missing, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.deck_cards held WHERE held.copy_id = uc.id
      );

    -- Every OTHER sleeved instance already competing for the new printing.
    SELECT count(*)::int INTO v_sleeved
    FROM public.import_sleeve_claims c
    JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
    WHERE c.user_id = p_user_id
      AND c.id <> p_claim_id
      AND c.card_name = v_card
      AND c.resolution = 'sleeved'
      AND dc.copy_id IS NULL
      AND COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id)
            IS NOT DISTINCT FROM v_effective
      AND CASE
            WHEN v_batch IS NOT NULL THEN c.batch_id = v_batch
            ELSE c.settled_at IS NULL
          END;

    IF v_sleeved >= v_available THEN
      v_new_state := 'planned';
      v_demoted := true;
    END IF;
  END IF;

  UPDATE public.import_sleeve_claims
  SET selected_printing_id = CASE
                               WHEN v_target IS NULL THEN NULL
                               WHEN v_target = COALESCE(v_imported, '') THEN NULL
                               ELSE v_target
                             END,
      resolution = v_new_state
  WHERE id = p_claim_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',              true,
    'claim_id',             p_claim_id,
    'card_name',            v_card,
    'selected_printing_id', CASE
                              WHEN v_target IS NULL THEN NULL
                              WHEN v_target = COALESCE(v_imported, '') THEN NULL
                              ELSE v_target
                            END,
    'effective_printing_id', v_effective,
    'state',                v_new_state,
    'demoted',              v_demoted
  );
END;
$function$;

COMMENT ON FUNCTION public.set_import_claim_printing(uuid, integer, text) IS
  'T-22: set or clear one import instance''s alternate printing. Same oracle_id, must be owned. Demotes a sleeved instance to planned when the new printing has no room.';

-- ===========================================================================
-- 6. set_import_claim_wishlist — one instance's wishlist toggle
--
-- Deliberately inert: it touches nothing but this column, so it can never move a
-- count, a resolution, or a deck slot (spec section 9).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_import_claim_wishlist(
  p_user_id    uuid,
  p_claim_id   integer,
  p_wishlisted boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card text;
BEGIN
  IF p_wishlisted IS NULL THEN
    RAISE EXCEPTION 'invalid_state: wishlisted must be true or false'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.import_sleeve_claims
  SET wishlist = p_wishlisted
  WHERE id = p_claim_id AND user_id = p_user_id
  RETURNING card_name INTO v_card;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'claim_id',   p_claim_id,
    'card_name',  v_card,
    'wishlisted', p_wishlisted
  );
END;
$function$;

COMMENT ON FUNCTION public.set_import_claim_wishlist(uuid, integer, boolean) IS
  'T-22: per-instance wishlist toggle for unowned import cards. Affects no count, no resolution and no deck membership.';

-- ===========================================================================
-- 7. set_import_claim_resolution — legacy shim, value-mapped
--
-- The pre-T-22 screen and its two wrapper RPCs
-- (resolve_import_conflict_release / resolve_import_conflict_proxy) still call
-- this. It now maps the old vocabulary onto the new values so the old path
-- cannot write a string the CHECK constraint forbids.
--
-- It deliberately does NOT run the supply check: the old screen's whole model was
-- to let the user re-introduce an over-commitment and see it. Correctness
-- property P1 therefore holds for writes through set_import_claim_state, and the
-- legacy shim is the documented exemption. Both are deleted in the retirement
-- migration (contract section 11, phase 5).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_import_claim_resolution(
  p_user_id    uuid,
  p_claim_id   integer,
  p_resolution text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state text;
  v_card  text;
BEGIN
  v_state := CASE lower(btrim(COALESCE(p_resolution, '')))
               WHEN 'planned' THEN 'planned'
               WHEN 'release' THEN 'planned'
               WHEN 'sleeved' THEN 'sleeved'
               WHEN 'sleeve'  THEN 'sleeved'
               WHEN 'proxy'   THEN 'proxy'
               ELSE NULL
             END;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'invalid_resolution: %', p_resolution USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.import_sleeve_claims
  SET resolution = v_state
  WHERE id = p_claim_id AND user_id = p_user_id
  RETURNING card_name INTO v_card;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'claim_id',   p_claim_id,
    'card_name',  v_card,
    'resolution', v_state
  );
END;
$function$;

-- ===========================================================================
-- 8. get_import_allocations — value-compatibility patch only
--
-- Body is unchanged from 20260920140500_get_import_allocations_v2_resolutions.sql
-- except that the two resolution predicates now read 'sleeved' instead of
-- 'sleeve'. Without this the old screen would filter on a value the CHECK
-- constraint forbids and silently match zero rows — the exact class of silent
-- wrong-answer bug the repo's query-gotchas steering doc exists to prevent.
--
-- This function is retired in phase 5; it is patched, not improved.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_import_allocations(
  p_user_id  uuid,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH scope AS (
    SELECT * FROM public.import_sleeve_claims
    WHERE user_id = p_user_id
      AND CASE
            WHEN p_batch_id IS NOT NULL THEN batch_id = p_batch_id
            ELSE settled_at IS NULL
          END
  ),
  claimed_cards AS (
    SELECT DISTINCT card_name FROM scope
  ),
  sleeve_demand AS (
    SELECT card_name, count(*)::int AS claim_count
    FROM scope
    WHERE resolution = 'sleeved'
    GROUP BY card_name
  ),
  decided AS (
    SELECT card_name,
           count(*) FILTER (WHERE resolution <> 'sleeved')::int AS decided_count
    FROM scope
    GROUP BY card_name
  ),
  sleeved_demand AS (
    SELECT dc.card_name, count(*)::int AS sleeved_count
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id AND dc.copy_id IS NOT NULL
      AND dc.ownership_status = 'original' AND uc.is_proxy = false
    GROUP BY dc.card_name
  ),
  owned AS (
    SELECT ucard.card_name, count(*)::int AS owned_count
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id AND uc.is_proxy = false AND uc.missing = false
    GROUP BY ucard.card_name
  ),
  combined AS (
    SELECT cc.card_name,
           COALESCE(sdl.claim_count, 0)   AS sleeve_claim_count,
           COALESCE(sld.sleeved_count, 0) AS sleeved_count,
           COALESCE(o.owned_count, 0)     AS owned_count,
           COALESCE(dc2.decided_count, 0) AS decided_count
    FROM claimed_cards cc
    LEFT JOIN sleeve_demand  sdl ON sdl.card_name = cc.card_name
    LEFT JOIN sleeved_demand sld ON sld.card_name = cc.card_name
    LEFT JOIN owned          o   ON o.card_name   = cc.card_name
    LEFT JOIN decided        dc2 ON dc2.card_name = cc.card_name
  ),
  enriched AS (
    SELECT cm.card_name,
           cm.owned_count,
           (cm.sleeve_claim_count + cm.sleeved_count) AS demand,
           cm.decided_count,
           CASE
             WHEN cm.owned_count = 0 AND cm.sleeve_claim_count > 0 THEN 'unowned'
             WHEN cm.owned_count > 0
                  AND (cm.sleeve_claim_count + cm.sleeved_count) > cm.owned_count THEN 'over'
             ELSE 'resolved'
           END AS state,
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'claim',
                      'claimId', s.id, 'deckCardsId', s.deck_cards_id,
                      'resolution', s.resolution
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM scope s
             JOIN public.decks d ON d.id = s.deck_id
             WHERE s.card_name = cm.card_name
           )
           ||
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'sleeved',
                      'claimId', null, 'deckCardsId', dc3.id,
                      'resolution', 'sleeved'
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.deck_cards dc3
             JOIN public.user_copies uc ON uc.id = dc3.copy_id
             JOIN public.decks d ON d.id = dc3.deck_id
             WHERE dc3.user_id = p_user_id AND dc3.card_name = cm.card_name
               AND dc3.copy_id IS NOT NULL AND dc3.ownership_status = 'original'
               AND uc.is_proxy = false
           ) AS decks
    FROM combined cm
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cardName', e.card_name,
           'owned', e.owned_count,
           'sleeved', e.demand,
           'state', e.state,
           'overAllocated', e.state = 'over',
           'decidedCount', e.decided_count,
           'decks', COALESCE(e.decks, '[]'::jsonb)
         ) ORDER BY (e.state = 'over') DESC, (e.state = 'unowned') DESC,
                    (e.state = 'resolved') ASC, e.card_name),
         '[]'::jsonb)
  INTO v_result
  FROM enriched e;

  RETURN jsonb_build_object('success', true, 'allocations', v_result);
END;
$function$;

-- ===========================================================================
-- 9. finalize_import_claims — per-instance materialisation
--
-- Four changes from 20260920140300_finalize_import_claims_honour_resolutions.sql:
--
--   a. PER INSTANCE, not all-or-nothing per card. The old guard materialised
--      NOTHING for an over-committed card. That guard existed because demand was
--      card-level and the old UI could not stop over-sleeving. The redesign
--      blocks over-sleeving at both the UI and the RPC boundary, so the guard now
--      only discards good decisions: one unsatisfiable instance would throw away
--      the user's choices for every other deck wanting that card.
--
--   b. EXACT PRINTING (D-021). A `sleeved` instance is assigned a copy whose
--      printing_id equals its effective printing. No name-only fallback. T-21
--      removed that fallback from reconcile_built_deck but it survived here,
--      which is how a slot could end up holding a printing the deck never asked
--      for.
--
--   c. PROXY REUSE. Spec sections 8 and 9 require reusing a free proxy before
--      creating one. The old body always inserted, so repeated runs accumulated
--      duplicate proxy rows.
--
--   d. ONE-LOCATION INTEGRITY and placement source. Every assignment now sets
--      deck_cards.placement_source = 'import' (placement-source.md row 12) and
--      clears user_copies.location_id. The old body left an assigned copy sitting
--      in a storage location while also being in a deck — the exact
--      simultaneous-location state the one-location model forbids.
--      reconcile_built_deck already does this correctly.
--
-- Claims that materialise are deleted (their outcome now lives on deck_cards).
-- Claims that do not — `planned`, and `sleeved` with no free copy — keep their
-- row and get settled_at stamped, so pressing "Go to Decks (12 unresolved)" does
-- not silently erase 12 decisions.
--
-- One transaction, per-card advisory lock. Card-level rather than
-- printing-level because an alternate-printing selection moves demand between
-- printings of the same card.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.finalize_import_claims(
  p_user_id  uuid,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card            text;
  v_claim           RECORD;
  v_copy_id         integer;
  v_copy_printing   text;
  v_proxy_id        integer;
  v_card_id         integer;
  v_oracle_id       uuid;
  v_finalized_count integer := 0;
  v_proxied_count   integer := 0;
  v_released_count  integer := 0;
  v_left_open_count integer := 0;
  v_settled_count   integer := 0;
BEGIN
  FOR v_card IN
    SELECT DISTINCT c.card_name
    FROM public.import_sleeve_claims c
    JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
    WHERE c.user_id = p_user_id
      AND dc.user_id = p_user_id
      AND dc.copy_id IS NULL
      AND CASE
            WHEN p_batch_id IS NOT NULL THEN c.batch_id = p_batch_id
            ELSE c.settled_at IS NULL
          END
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('import-card:' || v_card, 0));

    FOR v_claim IN
      SELECT c.id AS claim_id,
             c.deck_cards_id,
             c.resolution,
             COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id)
               AS printing_id
      FROM public.import_sleeve_claims c
      JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
      WHERE c.user_id = p_user_id
        AND c.card_name = v_card
        AND dc.user_id = p_user_id
        AND dc.copy_id IS NULL
        AND CASE
              WHEN p_batch_id IS NOT NULL THEN c.batch_id = p_batch_id
              ELSE c.settled_at IS NULL
            END
      ORDER BY c.id
    LOOP
      -- ---- planned: keep the claim as the durable record, slot stays planned.
      IF v_claim.resolution = 'planned' THEN
        UPDATE public.import_sleeve_claims
        SET settled_at = COALESCE(settled_at, now())
        WHERE id = v_claim.claim_id AND user_id = p_user_id;
        v_released_count := v_released_count + 1;
        v_settled_count  := v_settled_count + 1;
        CONTINUE;
      END IF;

      -- ---- sleeved: assign a free real copy of the EXACT effective printing.
      IF v_claim.resolution = 'sleeved' THEN
        v_copy_id       := NULL;
        v_copy_printing := NULL;

        SELECT uc.id, uc.printing_id
        INTO v_copy_id, v_copy_printing
        FROM public.user_copies uc
        JOIN public.user_cards ucard ON ucard.id = uc.card_id
        WHERE uc.user_id = p_user_id
          AND ucard.card_name = v_card
          AND v_claim.printing_id IS NOT NULL
          AND uc.printing_id = v_claim.printing_id
          AND uc.is_proxy = false
          AND COALESCE(uc.missing, false) = false
          AND NOT EXISTS (
            SELECT 1 FROM public.deck_cards held WHERE held.copy_id = uc.id
          )
        ORDER BY uc.id
        LIMIT 1
        FOR UPDATE OF uc;

        IF v_copy_id IS NOT NULL THEN
          UPDATE public.deck_cards
          SET copy_id          = v_copy_id,
              ownership_status = 'original',
              placement_source = 'import',
              scryfall_id      = COALESCE(v_copy_printing, scryfall_id)
          WHERE id = v_claim.deck_cards_id AND user_id = p_user_id;

          -- A copy in a deck is not in storage (one-location model).
          UPDATE public.user_copies
          SET location_id = NULL
          WHERE id = v_copy_id AND user_id = p_user_id;

          DELETE FROM public.import_sleeve_claims
          WHERE id = v_claim.claim_id AND user_id = p_user_id;

          v_finalized_count := v_finalized_count + 1;
        ELSE
          UPDATE public.import_sleeve_claims
          SET settled_at = COALESCE(settled_at, now())
          WHERE id = v_claim.claim_id AND user_id = p_user_id;
          v_left_open_count := v_left_open_count + 1;
          v_settled_count   := v_settled_count + 1;
        END IF;
        CONTINUE;
      END IF;

      -- ---- proxy: reuse a free proxy of the effective printing, else create.
      IF v_claim.resolution = 'proxy' THEN
        v_proxy_id := NULL;

        SELECT uc.id INTO v_proxy_id
        FROM public.user_copies uc
        JOIN public.user_cards ucard ON ucard.id = uc.card_id
        WHERE uc.user_id = p_user_id
          AND ucard.card_name = v_card
          AND uc.is_proxy = true
          AND COALESCE(uc.missing, false) = false
          AND uc.printing_id IS NOT DISTINCT FROM v_claim.printing_id
          AND NOT EXISTS (
            SELECT 1 FROM public.deck_cards held WHERE held.copy_id = uc.id
          )
        ORDER BY uc.id
        LIMIT 1
        FOR UPDATE OF uc;

        IF v_proxy_id IS NULL THEN
          -- Resolve the card identity, creating it if needed, so a card the user
          -- owns zero copies of can still be proxied.
          v_card_id   := NULL;
          v_oracle_id := NULL;

          SELECT id INTO v_card_id
          FROM public.user_cards
          WHERE user_id = p_user_id AND card_name = v_card
          ORDER BY id
          LIMIT 1;

          IF v_card_id IS NULL AND NULLIF(btrim(COALESCE(v_claim.printing_id, '')), '') IS NOT NULL THEN
            SELECT rp.oracle_id INTO v_oracle_id
            FROM public.ref_printings rp
            WHERE rp.scryfall_id::text = btrim(v_claim.printing_id)
            LIMIT 1;

            IF v_oracle_id IS NOT NULL THEN
              INSERT INTO public.user_cards (oracle_id, card_name, user_id)
              VALUES (v_oracle_id, v_card, p_user_id)
              ON CONFLICT (oracle_id, user_id) DO NOTHING
              RETURNING id INTO v_card_id;

              IF v_card_id IS NULL THEN
                SELECT id INTO v_card_id
                FROM public.user_cards
                WHERE user_id = p_user_id AND oracle_id = v_oracle_id
                LIMIT 1;
              END IF;
            END IF;
          END IF;

          IF v_card_id IS NULL THEN
            -- Unsynced printing: keep the decision rather than dropping it.
            UPDATE public.import_sleeve_claims
            SET settled_at = COALESCE(settled_at, now())
            WHERE id = v_claim.claim_id AND user_id = p_user_id;
            v_left_open_count := v_left_open_count + 1;
            v_settled_count   := v_settled_count + 1;
            CONTINUE;
          END IF;

          INSERT INTO public.user_copies (
            card_id, printing_id, is_proxy, user_id, source_tag, finish, location_id
          )
          VALUES (
            v_card_id, v_claim.printing_id, true, p_user_id,
            'import-conflict-proxy', 'nonfoil', NULL
          )
          RETURNING id INTO v_proxy_id;
        END IF;

        UPDATE public.deck_cards
        SET copy_id          = v_proxy_id,
            ownership_status = 'proxy',
            placement_source = 'import'
        WHERE id = v_claim.deck_cards_id AND user_id = p_user_id;

        UPDATE public.user_copies
        SET location_id = NULL
        WHERE id = v_proxy_id AND user_id = p_user_id;

        DELETE FROM public.import_sleeve_claims
        WHERE id = v_claim.claim_id AND user_id = p_user_id;

        v_proxied_count := v_proxied_count + 1;
        CONTINUE;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success',         true,
    'finalized_count', v_finalized_count,
    'proxied_count',   v_proxied_count,
    'released_count',  v_released_count,
    'left_open_count', v_left_open_count,
    'settled_count',   v_settled_count
  );
END;
$function$;

-- ===========================================================================
-- 10. get_deck_conflict_counts — redefined for the new default
--
-- Old definition recomputed card-level supply maths account-wide and counted
-- only resolution = 'sleeve'. With 'planned' as the new default that would
-- report zero conflicts for every deck immediately after import — a silently
-- empty badge.
--
-- New definition (contract section 7.6): a deck's badge counts distinct
-- (card_name, printing_id) pairs where the deck has a claim, open or settled,
-- whose deck_cards row still has copy_id IS NULL, and where at least one of
-- the deck's instances for that printing is unresolved per the same slot-level
-- resolved predicate used by get_import_reconciliation. That reads as "import
-- slots this deck can still do something about".
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_deck_conflict_counts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH scope AS (
    SELECT c.id                                                           AS claim_id,
           c.deck_id,
           c.card_name,
           c.printing_id                                                  AS imported_printing_id,
           COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id)
                                                                          AS effective_printing_id,
           c.resolution
    FROM public.import_sleeve_claims c
    JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
    WHERE c.user_id = p_user_id
      AND dc.user_id = p_user_id
      AND dc.copy_id IS NULL
  ),
  scope_cards AS (
    SELECT DISTINCT card_name FROM scope
  ),
  real_copies AS (
    SELECT ucard.card_name,
           uc.printing_id,
           uc.id          AS copy_id,
           held.id        AS held_slot_id
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    JOIN scope_cards sc          ON sc.card_name = ucard.card_name
    LEFT JOIN public.deck_cards held ON held.copy_id = uc.id
    WHERE uc.user_id = p_user_id
      AND uc.is_proxy = false
      AND COALESCE(uc.missing, false) = false
  ),
  printing_supply AS (
    SELECT card_name,
           printing_id,
           count(*) FILTER (WHERE held_slot_id IS NULL)::int AS available_supply
    FROM real_copies
    WHERE printing_id IS NOT NULL
    GROUP BY card_name, printing_id
  ),
  printing_demand AS (
    SELECT card_name,
           effective_printing_id AS printing_id,
           count(*) FILTER (WHERE resolution = 'sleeved')::int AS sleeved_intent
    FROM scope
    GROUP BY card_name, effective_printing_id
  ),
  printing_room AS (
    SELECT ps.card_name,
           ps.printing_id,
           (ps.available_supply > COALESCE(pd.sleeved_intent, 0)) AS has_room
    FROM printing_supply ps
    LEFT JOIN printing_demand pd ON pd.card_name = ps.card_name
                                AND pd.printing_id = ps.printing_id
  ),
  instance_demand AS (
    SELECT s.claim_id,
           COALESCE(pd.sleeved_intent, 0) AS eff_sleeved_intent,
           ps.available_supply            AS eff_available
    FROM scope s
    LEFT JOIN printing_demand pd ON pd.card_name = s.card_name
                                AND pd.printing_id = s.effective_printing_id
    LEFT JOIN printing_supply ps ON ps.card_name = s.card_name
                                AND ps.printing_id = s.effective_printing_id
  ),
  instance_room_anywhere AS (
    SELECT s.claim_id,
           COALESCE(bool_or(pr.has_room), false) AS has_room_anywhere
    FROM scope s
    LEFT JOIN printing_room pr ON pr.card_name = s.card_name AND pr.has_room
    GROUP BY s.claim_id
  ),
  instance_resolved AS (
    SELECT s.claim_id,
           s.deck_id,
           s.card_name,
           s.imported_printing_id,
           CASE
             WHEN s.resolution = 'proxy' THEN true
             WHEN s.resolution = 'sleeved' THEN
               id.eff_sleeved_intent <= id.eff_available
             WHEN s.resolution = 'planned' THEN
               NOT COALESCE(ira.has_room_anywhere, false)
           END AS resolved
    FROM scope s
    JOIN instance_demand id ON id.claim_id = s.claim_id
    LEFT JOIN instance_room_anywhere ira ON ira.claim_id = s.claim_id
  ),
  unresolved_pairs AS (
    SELECT DISTINCT deck_id, card_name, imported_printing_id
    FROM instance_resolved
    WHERE NOT resolved
  ),
  per_deck AS (
    SELECT deck_id,
           count(DISTINCT card_name || '|' || imported_printing_id)::int AS conflict_count,
           jsonb_agg(DISTINCT card_name ORDER BY card_name)              AS cards
    FROM unresolved_pairs
    GROUP BY deck_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'deckId', pd.deck_id,
           'count',  pd.conflict_count,
           'cards',  pd.cards
         ) ORDER BY pd.conflict_count DESC, pd.deck_id), '[]'::jsonb)
  INTO v_result
  FROM per_deck pd;

  RETURN jsonb_build_object('success', true, 'decks', v_result);
END;
$function$;

-- ===========================================================================
-- 11. Grants for the four NEW functions
--
-- The application calls these only through createAdminClient() (service role).
-- Restricting them to service_role removes the "an authenticated user could pass
-- somebody else's p_user_id" window that the older import RPCs still carry under
-- TD-037. Existing functions are left with their current grants: CREATE OR
-- REPLACE preserves them, so this migration opens no new privilege window.
--
-- Wrapped in a DO block so a shadow database without Supabase's default roles
-- does not fail the migration.
-- ===========================================================================

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.get_import_reconciliation(uuid, uuid, boolean) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.set_import_claim_state(uuid, integer, text)     FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.set_import_claim_printing(uuid, integer, text)  FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.set_import_claim_wishlist(uuid, integer, boolean) FROM PUBLIC;

  GRANT EXECUTE ON FUNCTION public.get_import_reconciliation(uuid, uuid, boolean) TO service_role;
  GRANT EXECUTE ON FUNCTION public.set_import_claim_state(uuid, integer, text)     TO service_role;
  GRANT EXECUTE ON FUNCTION public.set_import_claim_printing(uuid, integer, text)  TO service_role;
  GRANT EXECUTE ON FUNCTION public.set_import_claim_wishlist(uuid, integer, boolean) TO service_role;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'service_role not present; skipping grants (local shadow database)';
END $$;

-- ===========================================================================
-- REVERSIBILITY
--
-- Forward-only by convention, but every step is reversible without data loss:
--
--   Values:   UPDATE import_sleeve_claims SET resolution='release' WHERE resolution='planned';
--             UPDATE import_sleeve_claims SET resolution='sleeve'  WHERE resolution='sleeved';
--             then restore the old CHECK and DEFAULT 'sleeve'.
--   Columns:  selected_printing_id and wishlist are additive; leave them or drop
--             them (dropping loses only T-22 UI choices, never collection data).
--   Functions: re-apply the bodies from
--             20260920140300_finalize_import_claims_honour_resolutions.sql,
--             20260920140500_get_import_allocations_v2_resolutions.sql,
--             20260920140600_get_deck_conflict_counts_rpc.sql,
--             20260920140100_set_import_claim_resolution_rpc.sql.
--   The four new functions can simply be dropped.
--
-- No user_copies, user_cards, deck_cards or decks row is inserted, updated or
-- deleted by this migration.
-- ===========================================================================
