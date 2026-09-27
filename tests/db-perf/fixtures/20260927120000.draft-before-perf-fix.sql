-- TEST FIXTURE ONLY. NEVER APPLY.
-- Verbatim copy of the O-005 draft 20260927120000 as it stood BEFORE the
-- 2026-09-28 performance fix. tests/db-perf/reconciliation-perf.mjs uses it as
-- the semantic reference: the fixed draft must return identical output.

-- DRAFT — NOT YET APPROVED. Do not apply until the owner signs off.
--
-- Task O-005 (correction round 2): import reconciliation slot states.
-- Source of truth: docs/oracle/import-reconciliation-states.md (owner-approved)
-- Contract:        docs/oracle/contracts/import-reconciliation-redesign.md §2.4, §5, §7.6, §7.7
-- Supersedes the bodies of three functions deployed by
-- 20260926140000_import_reconciliation_redesign.sql. That file is deployed and
-- is NOT edited; this is a forward migration.
--
-- WHAT THIS FIXES
--
--   1. Competing demand counted only `sleeved` slots. Two planned slots
--      wanting one copy therefore looked conflict-free until someone clicked
--      Sleeve. Competing demand is now every in-scope slot whose state is
--      `planned` or `sleeved` on the effective printing (states doc,
--      "Overallocated"). `proxy` slots do not compete.
--
--   2. `alreadyClaimed` conflated two states. The read now returns a single
--      `slotState` per instance covering every state in the states doc, and
--      splits "claimed" into:
--        planned_claimed        (states 3, 9)  no usable copy anywhere
--        planned_alt_available  (states 2, 8)  requested printing gone, an
--                                              alternate printing is free
--
--   3. The `planned` resolved rule. Every Planned state in the states doc is
--      unresolved. The previous rule ("planned is resolved once every printing
--      has lost the race") is removed. The only planned slot that is resolved
--      is state 4: the requested printing fits every competing slot, so it is
--      allocated automatically.
--
--   4. State 4 is honoured at finalize. A planned slot on its imported
--      printing, where every competing slot fits the free supply, is sleeved by
--      finalize_import_claims. Without this, the screen would say
--      "Sleeved (owned)" and finalize would leave the slot Planned.
--
--   5. The deck conflict badge clears at "Allocate Cards" (owner decision
--      2026-09-27, docs/oracle/status.md O-005; states doc row 13).
--      get_deck_conflict_counts now reads only unsettled claims
--      (settled_at IS NULL). Finalize stamps settled_at on every claim it does
--      not materialise, so a slot left Planned after finalize is a normal
--      Planned deck slot, not an import conflict, and no longer shows on the
--      badge. The deployed version counted settled claims too.
--
-- WHAT THIS DOES NOT CHANGE
--
--   * set_import_claim_state / set_import_claim_printing: their supply check
--     (reject/demote when sleeved intent >= free copies) is already correct for
--     states 5-11. A Sleeve click reserves a copy against other Sleeve
--     decisions, not against planned slots — that is what lets the user choose
--     the winner in a conflict.
--   * reconcile_built_deck (import-time auto-assignment). See the Architect
--     report: it still assigns deck-by-deck, which conflicts with the states
--     doc's "assess the whole batch" rule. Separate task.
--
-- SAFETY
--
-- CREATE OR REPLACE on three existing functions; signatures unchanged, so
-- existing grants are preserved and there is no intermediate privilege window.
-- No table, column, constraint, index or row is created, altered or dropped by
-- the migration itself. finalize_import_claims keeps its single-transaction,
-- per-card advisory-lock behaviour.
--
-- REVERSIBILITY
--
-- Fully reversible: re-apply sections 3, 9 and 10 of
-- 20260926140000_import_reconciliation_redesign.sql. No data migration to undo.

-- ===========================================================================
-- 1. get_import_reconciliation — slot states per the states doc
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

  -- Demand on the EFFECTIVE printing, across the whole scope.
  --   sleeved_intent    — slots that have reserved a copy (Sleeve clicked).
  --                       Drives canSleeve and "is a copy still available now".
  --   competing_demand  — every slot that wants a real copy: planned + sleeved.
  --                       Drives "overallocated" and state 4 (states doc).
  printing_demand AS (
    SELECT card_name,
           effective_printing_id AS printing_id,
           count(*) FILTER (WHERE resolution = 'sleeved')::int                 AS sleeved_intent,
           count(*) FILTER (WHERE resolution IN ('sleeved', 'planned'))::int   AS competing_demand
    FROM scope
    GROUP BY card_name, effective_printing_id
  ),

  -- Alternate printings relative to the instance's effective printing. An
  -- alternate is "available" when it has a free copy not already reserved by a
  -- Sleeve decision — i.e. the user could switch to it and then Sleeve.
  instance_alternates AS (
    SELECT s.claim_id,
           COALESCE(bool_or(ps.available_supply > COALESCE(pd.sleeved_intent, 0)), false)
             AS alt_available
    FROM scope s
    LEFT JOIN printing_supply ps ON ps.card_name = s.card_name
                                AND ps.printing_id <> s.effective_printing_id
    LEFT JOIN printing_demand pd ON pd.card_name = ps.card_name
                                AND pd.printing_id = ps.printing_id
    GROUP BY s.claim_id
  ),

  instances AS (
    SELECT s.*,
           d.name                                AS deck_name,
           COALESCE(oa.owned_any, 0)             AS card_owned_any,
           COALESCE(eps.owned_total, 0)          AS eff_owned,
           COALESCE(eps.available_supply, 0)     AS eff_available,
           COALESCE(pdm.sleeved_intent, 0)       AS eff_sleeved_intent,
           COALESCE(pdm.competing_demand, 0)     AS eff_competing_demand,
           COALESCE(ia.alt_available, false)     AS alt_available,
           COALESCE(ecb.claimed_by, '[]'::jsonb) AS eff_claimed_by
    FROM scope s
    JOIN public.decks d ON d.id = s.deck_id
    LEFT JOIN owned_any           oa  ON oa.card_name = s.card_name
    LEFT JOIN printing_supply     eps ON eps.card_name = s.card_name
                                     AND eps.printing_id = s.effective_printing_id
    LEFT JOIN printing_demand     pdm ON pdm.card_name = s.card_name
                                     AND pdm.printing_id = s.effective_printing_id
    LEFT JOIN printing_claimed_by ecb ON ecb.card_name = s.card_name
                                     AND ecb.printing_id = s.effective_printing_id
    LEFT JOIN instance_alternates ia  ON ia.claim_id = s.claim_id
  ),
  instance_flags AS (
    SELECT i.*,
           -- Supply fact: could this slot hold a Sleeve reservation right now?
           -- A sleeved slot keeps it only while the whole sleeved set fits.
           CASE
             WHEN i.resolution = 'sleeved'
               THEN i.eff_sleeved_intent <= i.eff_available
             ELSE i.eff_sleeved_intent < i.eff_available
           END AS can_sleeve,
           -- States doc "Overallocated?": more competing slots than free copies
           -- of the effective printing. Irrelevant for proxy (state 12).
           (i.resolution <> 'proxy' AND i.eff_competing_demand > i.eff_available)
             AS instance_over_allocated,
           -- States doc, in the doc's priority order. Exactly one value.
           CASE
             WHEN i.resolution = 'proxy'                                THEN 'proxy'                       -- 12
             WHEN i.resolution = 'sleeved'
                  AND i.eff_sleeved_intent > i.eff_available            THEN 'sleeved_unsatisfiable'       -- supply lost after Sleeve
             WHEN i.resolution = 'sleeved'
                  AND i.selected_printing_id IS NOT NULL                THEN 'sleeved_alternate'           -- 11
             WHEN i.resolution = 'sleeved'                              THEN 'sleeved_owned'               -- 7
             -- planned from here
             WHEN i.selected_printing_id IS NULL
                  AND i.eff_owned > 0
                  AND i.eff_competing_demand <= i.eff_available         THEN 'sleeved_auto'                -- 4
             WHEN i.selected_printing_id IS NOT NULL
                  AND i.eff_available > i.eff_sleeved_intent            THEN 'planned_alternate_selected'  -- 10
             WHEN i.eff_available > i.eff_sleeved_intent                THEN 'planned_conflict'            -- 5, 6
             WHEN i.alt_available                                       THEN 'planned_alt_available'       -- 2, 8
             WHEN i.card_owned_any > 0                                  THEN 'planned_claimed'             -- 3, 9
             ELSE                                                            'planned_unowned'             -- 1
           END AS slot_state
    FROM instances i
  ),
  instance_display AS (
    SELECT f.*,
           f.slot_state IN ('proxy', 'sleeved_owned', 'sleeved_alternate', 'sleeved_auto')
             AS instance_resolved,
           -- Convenience flags, strictly derived from slot_state / supply.
           (f.slot_state = 'planned_claimed') AS already_claimed
    FROM instance_flags f
  ),

  row_keys AS (
    SELECT DISTINCT card_name, imported_printing_id FROM instance_display
  ),
  row_progress AS (
    SELECT card_name,
           imported_printing_id,
           count(*)::int                    AS instance_count,
           bool_and(instance_resolved)      AS row_resolved,
           bool_or(instance_over_allocated) AS row_over_allocated
    FROM instance_display
    GROUP BY card_name, imported_printing_id
  ),
  row_meta AS (
    SELECT rk.card_name,
           rk.imported_printing_id,
           COALESCE(oa.owned_any, 0)              AS owned_any,
           COALESCE(ps.owned_total, 0)            AS owned_total,
           COALESCE(ps.available_supply, 0)       AS available_supply,
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
           COALESCE(rpg.row_resolved, true)                        AS resolved,
           COALESCE(rpg.row_over_allocated, false)                 AS over_allocated,
           CASE WHEN rm.owned_any = 0 THEN 'unowned' ELSE 'owned' END AS ownership,
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
                        'slotState',           f.slot_state,
                        'selectedPrintingId',  f.selected_printing_id,
                        'effectivePrintingId', f.effective_printing_id,
                        'wishlisted',          f.wishlist,
                        'canSleeve',           f.can_sleeve,
                        'alternateAvailable',  f.alt_available,
                        'alreadyClaimed',      f.already_claimed,
                        'overAllocated',       f.instance_over_allocated,
                        'competingDemand',     f.eff_competing_demand,
                        'resolved',            f.instance_resolved,
                        'claimedBy',           f.eff_claimed_by
                      ) ORDER BY f.deck_name, f.claim_id), '[]'::jsonb)
               FROM instance_display f
               WHERE f.card_name = rf.card_name
                 AND f.imported_printing_id = rf.imported_printing_id
             ),
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
  'O-005: single read for import reconciliation. Per-instance slotState follows docs/oracle/import-reconciliation-states.md. Competing demand = planned + sleeved on the effective printing.';

-- ===========================================================================
-- 2. finalize_import_claims — honour state 4 (automatic allocation)
--
-- Only change from 20260926140000 section 9: before materialising a card, the
-- set of planned claims in state 4 is computed once under the card lock. A
-- claim is in state 4 when it is `planned`, has no alternate-printing override,
-- and every competing slot (planned + sleeved) on its printing fits the free
-- supply. Those claims take the `sleeved` branch. Because the whole competing
-- set fits, this cannot violate P1 and cannot starve a user-chosen Sleeve.
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
  v_resolution      text;
  v_auto_ids        integer[];
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

    -- State 4, computed once under the lock, before any assignment for this card.
    WITH card_scope AS (
      SELECT c.id,
             c.resolution,
             NULLIF(btrim(c.selected_printing_id), '')                          AS selected,
             COALESCE(NULLIF(btrim(c.selected_printing_id), ''), c.printing_id) AS eff
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
    ),
    demand AS (
      SELECT eff, count(*)::int AS competing
      FROM card_scope
      WHERE resolution IN ('planned', 'sleeved')
      GROUP BY eff
    ),
    supply AS (
      SELECT uc.printing_id AS eff, count(*)::int AS available
      FROM public.user_copies uc
      JOIN public.user_cards ucard ON ucard.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND ucard.card_name = v_card
        AND uc.is_proxy = false
        AND COALESCE(uc.missing, false) = false
        AND uc.printing_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.deck_cards held WHERE held.copy_id = uc.id
        )
      GROUP BY uc.printing_id
    )
    SELECT COALESCE(array_agg(cs.id), ARRAY[]::integer[])
    INTO v_auto_ids
    FROM card_scope cs
    JOIN demand d ON d.eff = cs.eff
    JOIN supply s ON s.eff = cs.eff
    WHERE cs.resolution = 'planned'
      AND cs.selected IS NULL
      AND d.competing <= s.available;

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
      v_resolution := v_claim.resolution;
      IF v_resolution = 'planned' AND v_claim.claim_id = ANY(v_auto_ids) THEN
        v_resolution := 'sleeved';
      END IF;

      -- ---- planned: keep the claim as the durable record, slot stays planned.
      IF v_resolution = 'planned' THEN
        UPDATE public.import_sleeve_claims
        SET settled_at = COALESCE(settled_at, now())
        WHERE id = v_claim.claim_id AND user_id = p_user_id;
        v_released_count := v_released_count + 1;
        v_settled_count  := v_settled_count + 1;
        CONTINUE;
      END IF;

      -- ---- sleeved (chosen, or state 4): a free real copy of the EXACT printing.
      IF v_resolution = 'sleeved' THEN
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
      IF v_resolution = 'proxy' THEN
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
-- 3. get_deck_conflict_counts — same slot-state predicate as section 1
--
-- Scope is account-wide across batches, but only UNSETTLED claims whose slot is
-- still copy_id IS NULL. This is the same scope get_import_reconciliation uses
-- when called without a batch id. Settled claims are excluded (fix 5 above):
-- once "Allocate Cards" runs, leftover Planned slots are normal Planned deck
-- slots and are not import conflicts. The deployed 20260926140000 version
-- included settled claims.
--
-- A deck's badge counts distinct (card_name, imported printing) pairs where at
-- least one of the deck's unsettled instances is unresolved. The slot-state
-- predicate and the demand measure are identical to section 1.
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
           NULLIF(btrim(c.selected_printing_id), '')                      AS selected_printing_id,
           c.resolution
    FROM public.import_sleeve_claims c
    JOIN public.deck_cards dc ON dc.id = c.deck_cards_id
    WHERE c.user_id = p_user_id
      AND dc.user_id = p_user_id
      AND dc.copy_id IS NULL
      -- Owner rule: after "Allocate Cards" (finalize stamps settled_at), the
      -- slot is a normal Planned deck slot and leaves the badge.
      AND c.settled_at IS NULL
  ),
  scope_cards AS (
    SELECT DISTINCT card_name FROM scope
  ),
  real_copies AS (
    SELECT ucard.card_name,
           uc.printing_id,
           held.id        AS held_slot_id
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
           count(*)::int                                     AS owned_total,
           count(*) FILTER (WHERE held_slot_id IS NULL)::int AS available_supply
    FROM real_copies
    WHERE printing_id IS NOT NULL
    GROUP BY card_name, printing_id
  ),
  printing_demand AS (
    SELECT card_name,
           effective_printing_id AS printing_id,
           count(*) FILTER (WHERE resolution = 'sleeved')::int               AS sleeved_intent,
           count(*) FILTER (WHERE resolution IN ('sleeved', 'planned'))::int AS competing_demand
    FROM scope
    GROUP BY card_name, effective_printing_id
  ),
  instance_alternates AS (
    SELECT s.claim_id,
           COALESCE(bool_or(ps.available_supply > COALESCE(pd.sleeved_intent, 0)), false)
             AS alt_available
    FROM scope s
    LEFT JOIN printing_supply ps ON ps.card_name = s.card_name
                                AND ps.printing_id <> s.effective_printing_id
    LEFT JOIN printing_demand pd ON pd.card_name = ps.card_name
                                AND pd.printing_id = ps.printing_id
    GROUP BY s.claim_id
  ),
  instance_state AS (
    SELECT s.claim_id,
           s.deck_id,
           s.card_name,
           s.imported_printing_id,
           CASE
             WHEN s.resolution = 'proxy' THEN 'proxy'
             WHEN s.resolution = 'sleeved'
                  AND COALESCE(pd.sleeved_intent, 0) > COALESCE(ps.available_supply, 0)
                                                         THEN 'sleeved_unsatisfiable'
             WHEN s.resolution = 'sleeved'
                  AND s.selected_printing_id IS NOT NULL THEN 'sleeved_alternate'
             WHEN s.resolution = 'sleeved'               THEN 'sleeved_owned'
             WHEN s.selected_printing_id IS NULL
                  AND COALESCE(ps.owned_total, 0) > 0
                  AND COALESCE(pd.competing_demand, 0) <= COALESCE(ps.available_supply, 0)
                                                         THEN 'sleeved_auto'
             WHEN s.selected_printing_id IS NOT NULL
                  AND COALESCE(ps.available_supply, 0) > COALESCE(pd.sleeved_intent, 0)
                                                         THEN 'planned_alternate_selected'
             WHEN COALESCE(ps.available_supply, 0) > COALESCE(pd.sleeved_intent, 0)
                                                         THEN 'planned_conflict'
             WHEN COALESCE(ia.alt_available, false)      THEN 'planned_alt_available'
             WHEN COALESCE(oa.owned_any, 0) > 0          THEN 'planned_claimed'
             ELSE                                             'planned_unowned'
           END AS slot_state
    FROM scope s
    LEFT JOIN printing_demand     pd ON pd.card_name = s.card_name
                                    AND pd.printing_id = s.effective_printing_id
    LEFT JOIN printing_supply     ps ON ps.card_name = s.card_name
                                    AND ps.printing_id = s.effective_printing_id
    LEFT JOIN owned_any           oa ON oa.card_name = s.card_name
    LEFT JOIN instance_alternates ia ON ia.claim_id = s.claim_id
  ),
  unresolved_pairs AS (
    SELECT DISTINCT deck_id, card_name, imported_printing_id
    FROM instance_state
    WHERE slot_state NOT IN ('proxy', 'sleeved_owned', 'sleeved_alternate', 'sleeved_auto')
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
