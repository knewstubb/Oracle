# Generated types plan: vector trial migration (DRAFT, nothing generated)

Slice V-09, Architect, 2026-11-06. Applies only after approval A3 and a successful apply (V-10).

## What exists
`src/types/supabase.ts` is the generated database type file [Confirmed: src/types/supabase.ts; contract §1.1].

## Plan
1. **Do not edit `src/types/supabase.ts` now.** The new tables do not exist online, so a regeneration today would not include them.
2. **After V-10 applies the migration** (rehearsal database first, then the target), the Developer regenerates types from that target with the Supabase CLI (`supabase gen types typescript --linked`, or `--local` for a throwaway database), writing to a temporary file first.
3. **Review the diff before replacing the file.** Expected: additions only, namely tables `ref_card_embeddings_trial`, `ref_combo_variants_trial`, `ref_combo_pieces_trial` and function `ref_similar_cards_trial`. Any change to an existing table is a stop-and-report signal, because it would mean the migration (or other unapplied drift) touched something it should not.
4. **Known wrinkle:** the generator types the `vector(384)` column as `string` (a text form like `[0.1,0.2,...]`), and the function's vector argument likewise [Approximate]. The trial harness is a script and converts to and from number arrays itself in one small helper; no hand edits to the generated file.
5. **The trial is not wired into the app**, so nothing under `src/` needs to import the new types. Because the diff is additive and the app never reads these tables, replacing the file is optional until the trial passes; the harness may use its own small local type file under `trial/vector/` instead.
6. **If the trial is reversed**, regenerate again and confirm the additions disappear.
7. **Hand-written reference types** (Architect owns, only if the Developer asks): `docs/oracle/contracts/vector-trial.types.ts`. Not created now; the generated file covers the same shapes.
