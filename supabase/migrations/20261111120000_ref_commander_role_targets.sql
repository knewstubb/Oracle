-- Approved by the owner 2026-11-11 (in chat: one new additive table, about 20-40 KB per commander, under 1 MB for
-- his 17 decks, reversible). Drafted by the Architect in docs/oracle/contracts/deck-health-phase2.md section 1.7;
-- written as a file by the Developer for Deck health slice S2 (commander targets).
--
-- Adds ONE table: public.ref_commander_role_targets, a cache of each commander's typical role numbers worked out
-- from EDHREC (average deck first, then the estimate). One row per EDHREC commander slug.
-- Shared reference data (same for every user), so no user_id column: a deliberate exception to the per-user rule;
-- it holds public EDHREC numbers only.
--
-- Columns used by the app (src/lib/commander-targets.ts, TargetsRow):
--   roles       [{role, typical, cardsInRole, rawSum?}]  (rawSum only for the estimate; empty unless status = 'ok')
--   cards       [{name, roles[], inclusion, quantity?}]  (non-land cards, deduped)
--   lands_avg   typical land count (average deck: lands in the deck; estimate: EDHREC's average land count)
--
-- Safety: additive only. CREATE TABLE IF NOT EXISTS; no DROP, TRUNCATE, DELETE or UPDATE of anything existing.
-- RLS on: signed-in users may read; no insert/update/delete policy, so only the server's admin client writes.
-- Reversible: drop table public.ref_commander_role_targets;  (the app falls back to fetching EDHREC live and
-- the general guide; the data is re-created on demand.)

create table if not exists public.ref_commander_role_targets (
  edhrec_slug        text        primary key,
  commander_name     text        not null,
  status             text        not null check (status in ('ok', 'thin', 'not_found')),
  source             text        not null default 'edhrec_estimate' check (source in ('edhrec_average', 'edhrec_estimate')),
  roles              jsonb       not null default '[]'::jsonb,
  cards              jsonb       not null default '[]'::jsonb,
  cards_used         integer     not null default 0,
  deck_sample        integer,
  coverage           numeric,
  lands_avg          numeric,
  type_counts        jsonb       not null default '[]'::jsonb,
  classifier_version integer     not null,
  fetched_at         timestamptz not null default now()
);

alter table public.ref_commander_role_targets enable row level security;

create policy ref_commander_role_targets_read
  on public.ref_commander_role_targets for select to authenticated using (true);

comment on table public.ref_commander_role_targets is
  'Deck health: cached typical ramp/draw/removal/wipes/lands per commander from EDHREC (contract deck-health-phase2 1.7). Shared reference data; server writes only.';
