-- APPLIED 2026-11-16 to the hosted project (this one file only, owner-approved, amended version with subtypes and keywords). Undo: supabase/drafts/20261116200000_connector_collection_copies_view.rollback.sql
-- CC-07 (filterable collection search for Claude). Contract: docs/oracle/contracts/connector-collection-search.md section 4.
--
-- What it does: adds ONE read-only view, one row per physical copy, that already joins the things search needs:
-- the card's type, mana value and colours (from the shared card library, matched by exact card name), and where the
-- copy is (deck, storage place, In your hand, Missing). Search can then filter and count on the database side
-- instead of reading the whole collection into the app.
--
-- Why a view and not copying type/colour into user_cards: user_cards.type_line and color_identity are EMPTY for all
-- 2,832 live cards (checked 2026-11-16), and a copy would drift from the library. A view stores nothing.
--
-- Safety:
--   * No table, column or row changes. Nothing is written. Reversible: DROP VIEW (rollback file next to this one).
--   * security_invoker = true: the view runs as the signed-in user, so the existing own-row policies on user_copies,
--     user_cards, deck_cards, decks and user_locations apply. A user can only ever see their own rows (same data-separation rule as the other user tables).
--   * The view also filters nothing by user itself; every connector query MUST still add user_id = <verified sub>.
--   * anon gets no access.
--
-- Identifier columns: oracle_id = oracle_id (the card across printings); printing_id = scryfall_id (one printing). D-003.
-- Primary key of the view: copy_id (user_copies.id). Indexes used: user_copies(user_id, card_id), deck_cards unique
-- (copy_id), ref_cards primary key (name). No new index is needed at today's size (about 4,550 copies, 32,500 library
-- cards); measured 2026-11-16: the equivalent join with a type and colour filter ran in about 160 ms.
--
-- Colour text: the library stores colours as "R, W" for most cards and "BW" for a few (86 rows). The view turns both
-- into the same letters in the fixed order W U B R G, and '' for colourless. A card with no library row has
-- facts_available = false and null type, mana value and colour columns, so it is never silently treated as colourless.

create or replace view public.connector_collection_copies
with (security_invoker = true) as
select
  c.user_id,
  c.id                  as copy_id,
  c.card_id,
  uc.oracle_id,                       -- oracle_id (card across printings)
  uc.card_name,
  c.printing_id,                      -- scryfall_id (one printing)
  c.finish,
  c.is_proxy,
  c.missing,
  c.in_hand,
  case
    when c.missing then 'missing'
    when c.in_hand then 'in_hand'
    when d.deck_id is not null then 'deck'
    when c.location_id is not null then 'storage'
    else 'unplaced'
  end                   as place_kind,
  d.deck_id,
  dk.name               as deck_name,
  c.location_id,
  l.name                as storage_name,
  (not c.missing and not c.in_hand and d.deck_id is null) as is_free,
  (r.name is not null)  as facts_available,
  r.type_line,
  r.mana_value,
  case when r.name is null then null else x.ci end as colour_letters,
  (r.name is not null and x.ci like '%W%') as has_w,
  (r.name is not null and x.ci like '%U%') as has_u,
  (r.name is not null and x.ci like '%B%') as has_b,
  (r.name is not null and x.ci like '%R%') as has_r,
  (r.name is not null and x.ci like '%G%') as has_g,
  (r.name is not null and x.ci = '')       as is_colourless,
  -- Type flags look at the whole type line, so a two-faced card counts as every type on either face.
  (r.name is not null and lower(r.type_line) like '%creature%')     as t_creature,
  (r.name is not null and lower(r.type_line) like '%instant%')      as t_instant,
  (r.name is not null and lower(r.type_line) like '%sorcery%')      as t_sorcery,
  (r.name is not null and lower(r.type_line) like '%artifact%')     as t_artifact,
  (r.name is not null and lower(r.type_line) like '%enchantment%')  as t_enchantment,
  (r.name is not null and lower(r.type_line) like '%planeswalker%') as t_planeswalker,
  (r.name is not null and lower(r.type_line) like '%land%')         as t_land,
  (r.name is not null and lower(r.type_line) like '%battle%')       as t_battle,
  -- One type per card for counting, from the FRONT face only: Land, Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment.
  case
    when r.name is null then null
    when lower(split_part(r.type_line, ' // ', 1)) like '%land%'         then 'Land'
    when lower(split_part(r.type_line, ' // ', 1)) like '%creature%'     then 'Creature'
    when lower(split_part(r.type_line, ' // ', 1)) like '%planeswalker%' then 'Planeswalker'
    when lower(split_part(r.type_line, ' // ', 1)) like '%battle%'       then 'Battle'
    when lower(split_part(r.type_line, ' // ', 1)) like '%instant%'      then 'Instant'
    when lower(split_part(r.type_line, ' // ', 1)) like '%sorcery%'      then 'Sorcery'
    when lower(split_part(r.type_line, ' // ', 1)) like '%artifact%'     then 'Artifact'
    when lower(split_part(r.type_line, ' // ', 1)) like '%enchantment%'  then 'Enchantment'
    else 'Other'
  end                   as primary_type,
  -- AMENDED 2026-11-16 (owner decision 3): creature types etc. (Elf, Equipment, Kithkin) and keywords (flying, haste).
  -- subtypes: lower-case words after the dash on EITHER face. Empty array = the card has no subtypes (an Instant, Sol Ring).
  -- null = no library row (never treated as "has none"). Library writes subtypes comma separated: "Creature — Elf, Druid".
  case when r.name is null then null else sx.subs end as subtypes,
  -- keywords: lower-case copy of the library's keywords list. Empty array = the card has none. null = no library row.
  case when r.name is null then null else kx.kws end  as keywords
from public.user_copies c
join public.user_cards uc on uc.id = c.card_id
left join public.ref_cards r on r.name = uc.card_name
left join public.deck_cards d on d.copy_id = c.id
left join public.decks dk on dk.id = d.deck_id
left join public.user_locations l on l.id = c.location_id
cross join lateral (
  select
    case when coalesce(r.color_identity, '') like '%W%' then 'W' else '' end ||
    case when coalesce(r.color_identity, '') like '%U%' then 'U' else '' end ||
    case when coalesce(r.color_identity, '') like '%B%' then 'B' else '' end ||
    case when coalesce(r.color_identity, '') like '%R%' then 'R' else '' end ||
    case when coalesce(r.color_identity, '') like '%G%' then 'G' else '' end as ci
) x
cross join lateral (
  select coalesce(array_agg(distinct lower(btrim(s))) filter (where btrim(s) <> ''), '{}'::text[]) as subs
  from unnest(string_to_array(coalesce(r.type_line, ''), ' // ')) as face,
       lateral regexp_split_to_table(
         case when position('—' in face) > 0 then substr(face, position('—' in face) + 1) else '' end, ',') as s
) sx
cross join lateral (
  select coalesce(array_agg(lower(k)), '{}'::text[]) as kws
  from unnest(coalesce(r.keywords, '{}'::text[])) as k
) kx;

comment on view public.connector_collection_copies is
  'CC-07: one row per physical copy with card facts and place. Read by the Claude connector search. security_invoker: own rows only. Every query must still filter user_id.';

revoke all on public.connector_collection_copies from public, anon;
grant select on public.connector_collection_copies to authenticated;
