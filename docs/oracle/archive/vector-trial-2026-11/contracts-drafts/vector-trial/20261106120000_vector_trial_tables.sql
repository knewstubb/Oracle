-- =====================================================================================================================
-- DRAFT. NOT APPLIED. NOT IN supabase/migrations/ ON PURPOSE.
-- Slice V-09 (Architect), 2026-11-06. Contract: docs/oracle/contracts/vector-trial-2026-11.md §2.2, §4A.2, §6.
-- Owner approval A3 is required before this is copied to supabase/migrations/ and applied (V-10 does the copy, after a
-- rehearsal on a throwaway database). Nothing in this file is authorised until then.
--
-- Intended final name: supabase/migrations/20261106120000_vector_trial_tables.sql
--   Sorts after 20261023170200 (the highest local and hosted migration; all ten import migrations are applied, V-02 §4).
--   V-10 must re-check at copy time that nothing newer has been merged and renumber if so.
--
-- What it creates (all NEW; no existing table, function, policy or row is touched):
--   1. extension "vector" (pgvector) in schema "extensions"      -- fails with a plain message if not available
--   2. table  public.ref_card_embeddings_trial                    -- one vector per card face per recipe arm
--   3. table  public.ref_combo_variants_trial                     -- Commander Spellbook combos
--   4. table  public.ref_combo_pieces_trial                       -- cards in each combo (FK to variants)
--   5. function public.ref_similar_cards_trial(...)               -- read-only "find similar cards"
--
-- REVERSIBLE: yes, with the companion file 20261106120000_vector_trial_tables.reverse.sql (drops only the four
-- objects above, never the extension). The tables hold only reproducible public data. Forward-only otherwise.
--
-- IDENTIFIER RULE (D-003): every identifier column below holds a Scryfall oracle_id (canonical card), never a scryfall_id
-- (printing). Names are display text only.
--
-- NO user_id ON PURPOSE (deliberate exception to the multi-user standard): shared public reference data, like ref_rulings.
-- RLS: read for signed-in users, write for service role only. No user data is stored here.
-- No vector index (contract C5): ~18,850 rows, exact scan.
-- No FK from embeddings/pieces to card tables: ref_printings.oracle_id is not unique, so no valid target.
-- No destructive statements; every statement is create-only. Policies use a plain CREATE POLICY, so a name clash
-- with a pre-existing object FAILS the migration instead of dropping anything.
-- APPLY BY RUNNING THIS FILE ONLY, never by a blanket push: T-57's unapplied migration (20261013120000) sorts earlier.
-- A second embedding model needs a NEW migration (the 384-dimension column and recipe-arm check are fixed here).
-- =====================================================================================================================

-- 0. Plain-language guard: stop early, with a readable message, if pgvector is not offered by this database.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'vector') then
    raise exception 'vector_trial: pgvector (extension "vector") is not available on this database. Nothing was changed.';
  end if;
end
$$;

-- 1. Extension. "if not exists" makes it a no-op if someone already enabled it. The "extensions" schema is the Supabase default.
create extension if not exists vector with schema extensions;

-- 2. Embeddings -------------------------------------------------------------------------------------------------
create table if not exists public.ref_card_embeddings_trial (
  oracle_id             uuid        not null,             -- Scryfall oracle_id (canonical card). NOT scryfall_id (D-003).
  face_index            smallint    not null default 0,   -- 0 = front or only face, 1 = back/second face
  face_name             text        not null,             -- display/debug only; never a join key
  text_hash             text        not null,             -- sha256 of the exact embedded text; skip re-embedding if unchanged
  embedded_text_version text        not null,             -- recipe arm: 'v2-base' or 'v2-tagged' (contract §2.3)
  tags                  text[]      not null default '{}',-- Tagger slugs that were in the embedded text; empty for v2-base
  model_name            text        not null,             -- e.g. 'BAAI/bge-small-en-v1.5'
  model_version         text        not null,             -- pinned revision or date
  dimension             smallint    not null,             -- must equal the vector size
  source_snapshot       date        not null,             -- Scryfall bulk date the text came from
  embedding             extensions.vector(384) not null,   -- sized for the recommended model (contract §3)
  created_at            timestamptz not null default now(),
  constraint ref_card_embeddings_trial_pkey primary key (oracle_id, face_index, embedded_text_version),
  constraint ref_card_embeddings_trial_dimension_chk check (dimension = 384),
  constraint ref_card_embeddings_trial_version_chk check (embedded_text_version in ('v2-base', 'v2-tagged'))
);

-- Only needed for the tag-filter check (contract §5.5).
create index if not exists ref_card_embeddings_trial_tags_gin
  on public.ref_card_embeddings_trial using gin (tags);

comment on table  public.ref_card_embeddings_trial is 'TRIAL (vector-trial-2026-11). One embedding per card face per recipe arm. Public card text only; reproducible; safe to drop.';
comment on column public.ref_card_embeddings_trial.oracle_id is 'Scryfall oracle_id (canonical card identity), never a printing id (D-003).';
comment on column public.ref_card_embeddings_trial.face_name is 'Display/debug only. Never a join key.';
comment on column public.ref_card_embeddings_trial.tags is 'Scryfall Tagger slugs included in the embedded text (tagged arm); empty for base arm.';

alter table public.ref_card_embeddings_trial enable row level security;

create policy "ref_card_embeddings_trial_select_policy" on public.ref_card_embeddings_trial
  for select to authenticated using (true);

create policy "ref_card_embeddings_trial_modify_policy" on public.ref_card_embeddings_trial
  for all using (auth.role() = 'service_role');

-- 3. Combo variants ---------------------------------------------------------------------------------------------
create table if not exists public.ref_combo_variants_trial (
  variant_id       text        primary key,               -- Spellbook variant id, e.g. '392-967-5078'
  identity         text        not null,                  -- Spellbook colour identity letters ('' = colourless)
  commander_legal  boolean     not null,                  -- Spellbook legalities.commander; re-verified per piece at query time
  piece_count      smallint    not null,                  -- number of card pieces, commander included
  template_count   smallint    not null default 0,        -- non-card requirements; > 0 is never labelled 'complete'
  popularity       integer     not null,
  bracket_tag      text,
  produces         text[]      not null default '{}',     -- feature names, display only
  summary          text,                                  -- first lines of description, display only
  source_snapshot  timestamptz not null,                  -- Spellbook bulk 'timestamp'
  source_version   text        not null                   -- Spellbook bulk 'version'
);

comment on table public.ref_combo_variants_trial is 'TRIAL (vector-trial-2026-11). Commander Spellbook combo variants. Public data; reloadable from the dated bulk file; safe to drop.';

-- 4. Combo pieces -----------------------------------------------------------------------------------------------
create table if not exists public.ref_combo_pieces_trial (
  variant_id         text    not null references public.ref_combo_variants_trial (variant_id) on delete cascade,
  oracle_id          uuid    not null,                    -- Scryfall oracle_id from Spellbook card.oracleId. NOT scryfall_id (D-003).
  must_be_commander  boolean not null default false,
  constraint ref_combo_pieces_trial_pkey primary key (variant_id, oracle_id)
);

-- "which combos contain this card"
create index if not exists ref_combo_pieces_trial_oracle on public.ref_combo_pieces_trial (oracle_id);

comment on table  public.ref_combo_pieces_trial is 'TRIAL (vector-trial-2026-11). Cards in each combo variant. Public data; safe to drop (drop before variants).';
comment on column public.ref_combo_pieces_trial.oracle_id is 'Scryfall oracle_id (canonical card identity), never a printing id (D-003).';

alter table public.ref_combo_variants_trial enable row level security;
alter table public.ref_combo_pieces_trial   enable row level security;

create policy "ref_combo_variants_trial_select_policy" on public.ref_combo_variants_trial
  for select to authenticated using (true);
create policy "ref_combo_variants_trial_modify_policy" on public.ref_combo_variants_trial
  for all using (auth.role() = 'service_role');

create policy "ref_combo_pieces_trial_select_policy" on public.ref_combo_pieces_trial
  for select to authenticated using (true);
create policy "ref_combo_pieces_trial_modify_policy" on public.ref_combo_pieces_trial
  for all using (auth.role() = 'service_role');

-- 5. Similar-cards function (READ-ONLY) -------------------------------------------------------------------------
-- Seed: either a list of cards (their vectors are averaged) or a ready-made vector (used for the 0.4/0.6 blend in
-- contract §5.6, built by the harness). Exactly one must be given. Cosine distance ignores vector length, so the
-- plain average needs no normalising.
-- Filters (contract §4 step 2): colour identity inside p_identity, Commander-legal, not excluded. Exact scan: no index.
-- Returns best (smallest) distance per card across its faces. Reads ref_printings only for identity and legality; reads
-- NO user table. SECURITY INVOKER: RLS of the caller applies.
-- NOTE vs contract §2.2 sketch: adds p_version (which recipe arm to search) and p_seed_vector. Contract updated to match.
create or replace function public.ref_similar_cards_trial(
  p_identity            text[],
  p_version             text,
  p_seed_oracle_ids     uuid[]                 default null,
  p_seed_vector         extensions.vector(384) default null,
  p_exclude_oracle_ids  uuid[]                 default '{}',
  p_k                   int                    default 200
)
returns table (oracle_id uuid, best_face_index smallint, distance double precision)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_seed extensions.vector(384);
begin
  if (p_seed_oracle_ids is null) = (p_seed_vector is null) then
    raise exception 'ref_similar_cards_trial: give exactly one of p_seed_oracle_ids or p_seed_vector';
  end if;

  if p_seed_vector is not null then
    v_seed := p_seed_vector;
  else
    select avg(e.embedding)::extensions.vector(384) into v_seed
    from public.ref_card_embeddings_trial e
    where e.embedded_text_version = p_version
      and e.oracle_id = any (p_seed_oracle_ids);
  end if;

  if v_seed is null then
    return;  -- no seed vectors found: return nothing (shown as "no result", never invented)
  end if;

  return query
  select s.oracle_id, s.face_index, s.dist
  from (
    select distinct on (e.oracle_id)
           e.oracle_id, e.face_index, (e.embedding <=> v_seed)::double precision as dist
    from public.ref_card_embeddings_trial e
    where e.embedded_text_version = p_version
      and e.oracle_id <> all (coalesce(p_exclude_oracle_ids, '{}'))
      and exists (
        select 1 from public.ref_printings p
        where p.oracle_id = e.oracle_id
          and p.legality_commander = 'legal'
          and coalesce(p.color_identity, '{}') <@ p_identity
      )
    order by e.oracle_id, (e.embedding <=> v_seed)
  ) s
  order by s.dist
  limit greatest(p_k, 0);
end;
$$;

comment on function public.ref_similar_cards_trial(text[], text, uuid[], extensions.vector, uuid[], int) is
  'TRIAL (vector-trial-2026-11). Read-only. Cards most similar to a seed, filtered by colour identity and Commander legality. Reads no user table.';

revoke all on function public.ref_similar_cards_trial(text[], text, uuid[], extensions.vector, uuid[], int) from public, anon;
grant execute on function public.ref_similar_cards_trial(text[], text, uuid[], extensions.vector, uuid[], int)
  to authenticated, service_role;
