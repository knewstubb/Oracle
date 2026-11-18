-- APPLIED live 2026-11-18 (run through the Supabase connection). Needs owner approval (owner asked for this rename 2026-11-18).
-- Renames the storage location "Trade Binder" to "Black Binder". The name is only a label: no code looks for
-- "Trade Binder" by name, and no cards move. A trade-only location type (kept out of recommendations) is a separate, later task.
-- Safe to run once; it changes nothing if there is no "Trade Binder" or if "Black Binder" already exists.
BEGIN;
UPDATE public.user_locations
   SET name = 'Black Binder'
 WHERE type = 'storage'
   AND name = 'Trade Binder'
   AND NOT EXISTS (
     SELECT 1 FROM public.user_locations x
      WHERE x.type = 'storage' AND x.name = 'Black Binder'
   )
RETURNING id, name;
COMMIT;
-- To undo: run the same statement with the two names swapped.
