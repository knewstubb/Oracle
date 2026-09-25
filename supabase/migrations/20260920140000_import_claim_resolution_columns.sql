-- Import sleeve claims: make reconciliation decisions REVERSIBLE and non-destructive.
--
-- WHY: the original resolve RPCs finalized immediately — `release` DELETEd the claim
-- (irreversible: no way back to "sleeve") and `proxy` INSERTed a real user_copies
-- proxy row plus set copy_id mid-reconciliation. That meant a mis-click permanently
-- changed physical state, and the conflict could not be re-introduced.
--
-- Now a claim carries an INTENT, not an action:
--   resolution 'sleeve'  (default) — this deck still wants a real copy
--   resolution 'release'           — set the slot to Planned
--   resolution 'proxy'             — sleeve a printing-matched proxy
--
-- Conflict demand counts only 'sleeve' claims, so releasing/proxying enough slots
-- resolves the card, and flipping one back to 'sleeve' re-introduces the conflict.
-- Nothing is materialized until the finalize pass runs on "Go to Decks".
--
-- batch_id groups the claims created by one import run. Reconciliation reads and
-- finalizes ONLY the current run, so claims left unresolved by an earlier import
-- can never inflate a later run's numbers or be silently materialized by it.
--
-- settled_at is stamped on claims that a finished run left unresolved. Those rows
-- are the durable record behind the cross-page conflict badge (spec design.md
-- Phasing → Phase 2 reads the same import_sleeve_claims), and steady-state
-- allocation code still ignores them entirely.
ALTER TABLE public.import_sleeve_claims
  ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT 'sleeve',
  ADD COLUMN IF NOT EXISTS batch_id   uuid,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.import_sleeve_claims
    ADD CONSTRAINT import_sleeve_claims_resolution_check
    CHECK (resolution IN ('sleeve', 'release', 'proxy'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Reconciliation is always scoped to (user, batch); the conflict badge looks for
-- settled rows per user.
CREATE INDEX IF NOT EXISTS idx_import_sleeve_claims_user_batch
  ON public.import_sleeve_claims (user_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_import_sleeve_claims_user_settled
  ON public.import_sleeve_claims (user_id, settled_at)
  WHERE settled_at IS NOT NULL;;
