# Contract: Multi-label Card Tagging Pipeline

**Status:** Proposed design for review; no implementation, migration, data write, or paid model request is authorized by this document.
**Scope:** Global card-identity mechanic and role tags for commander-specific recommendation retrieval. This extends `docs/category-taxonomy.md`; it does not change collection/allocation behavior or claim recommendation quality by itself.
**Date:** 2026-10-02

## 1. Goal and boundaries

Build a canonical, multi-label tag profile for each Magic card identity, keyed by Scryfall `oracle_id` (D-003). One card may express multiple events, zones, resources, conditions, and deck roles. Card tags describe text-grounded mechanics; they do not assert commander fit, deck legality, combo membership, ownership, printing, price, or availability.

The recommender should be able to distinguish, for example:

- Prosper's exile-cast loop: access to cards in exile, specifically permission to **cast** (not just play) them under a relevant timing condition, Treasure production on that event, Treasure/artifact consumers, and cast-from-exile payoffs.
- Korvold's sacrifice plan: sacrifice of permanents as an event, sacrifice outlets, sacrifice payoffs, expendable permanents/tokens, and draw/counter rewards. Sacrifice and “dies” remain distinct events.

Jev is out of scope for this pipeline and is only a possible future runtime deck-fit scoring option. This pipeline uses deterministic identity/tag mapping plus a one-time and delta Haiku fallback; it does not select Jev or replace runtime reasoning.

## 2. Existing inputs and constraints

- Scryfall distinguishes printing IDs (`scryfall_id`) from canonical card IDs (`oracle_id`); semantic tags belong to the latter [Confirmed: `docs/oracle/decisions.md` D-003; Scryfall Tags API].
- The repository already has global reference taxonomy and commander taxonomy structures, plus a `keywords[]` field on `ref_cards` [Confirmed: `supabase/migrations/20260803100000_create_ref_taxonomy.sql`]. The existing broad role vocabulary is documented in `docs/category-taxonomy.md`; it is not mechanic-granular enough by itself.
- The older taxonomy document refers to `card_metadata.default_category` and `deck_cards.categories` as if available, while a later migration drops the legacy `card_metadata` table [Confirmed: `docs/category-taxonomy.md`; `supabase/migrations/20260730070439_drop_legacy_tables.sql`]. This proposal therefore introduces a new global reference-data contract and does not assume that old category storage is live.
- Scryfall's Tagger is community-maintained, provides oracle tags with UUIDs, card-level `oracle_id` taggings, hierarchy, weights and optional annotation, and publishes an Oracle Tags bulk file that is updated daily [Scryfall Tags API and Bulk Data, accessed 2026-10-02]. Treat it as externally evidenced input, not ground truth.
- D-016 requires structured LLM data to arrive through tool use or a JSON sidecar; the proposed Haiku extraction uses forced strict tool use and validates tool arguments as typed data. Never scrape labels from generated prose [Confirmed: `docs/oracle/decisions.md` D-016].

## 3. Vocabulary contract

The initial vocabulary is the proposed **Mechanic-Level Multi-Label Vocabulary** section in `docs/category-taxonomy.md`. It follows `docs/deck-taxonomy.md`'s distinction: the deck/build has one or more **archetypes** (game-plan verbs) and **themes** (resource nouns), while card-level mechanic tags are the wiring that helps retrieve cards for a selected build. Mechanics are not a new third user-facing deck category. A commander can support several materially different builds, and the 20-commander test set below explicitly samples those variants rather than assigning each commander one fixed plan. Core dimensions are:

1. **Event/action** — e.g., `action.cast_from_exile`, `action.play_from_exile`, `action.sacrifice_other`, `event.permanent_dies`, `event.spell_cast`.
2. **Zone and timing** — e.g., `zone.exile.access`, `condition.exile_this_turn`, `action.cast_from_graveyard`, `timing.once_per_turn`.
3. **Resource/object** — e.g., `resource.treasure.produce`, `resource.treasure.sacrifice_for_mana`, `resource.draw`, `resource.counter.plus_one_plus_one`.
4. **Role** — e.g., `role.enabler`, `role.payoff`, `role.producer`, `role.consumer`, `role.outlet`, `role.engine`, `role.recursion`, `role.interaction`.
5. **Plan/type affinity** — e.g., `plan.treasures`, `plan.aristocrats`, `tribe.goblin`; not a replacement for literal mechanic labels.

Slugs are stable internal `snake_case` identifiers, versioned as part of `taxonomy_version`. They are not Scryfall tag slugs, English display labels, card names, or Commander-specific suitability verdicts. Values that vary by card (specific creature type, counter type, targeted object, controller, frequency, zone) should be structured attributes or controlled values rather than invented tag spellings.

**Multi-label invariant:** zero or more labels per card identity; no required primary tag and no “exactly one” classifier. Keep broad role categories (ramp/draw/removal/etc.) as separate role labels. `unknown`/`unclassified` is a profile status, not a mechanic label. “Combo piece” remains relational and deck-level.

**Evidence invariant:** each label preserves its source, source reference, confidence/weight, and pipeline/taxonomy versions. Distinguish literal rules evidence, Scryfall community evidence, statistical evidence, and model inference. Do not turn statistical commander inclusion into text-grounded mechanics.

### 3.1 Conditional semantics

The vocabulary/profile must preserve distinctions that affect rules correctness: cast vs play; exile access vs an exile action; cast from exile vs a card exiled this turn; sacrifice vs dies; token vs nontoken; any permanent vs creature; self vs opponent; controller; source zone; cast vs put onto battlefield; timing/once-per-turn; and modal/card-face-specific text. When the model cannot support a condition with the supplied card facts, leave it unknown rather than generalizing.

For double-faced/modal cards, classification input includes all relevant faces and face names/types/oracle text. Output evidence identifies a face or shared card text. The canonical profile still keys to one `oracle_id`; do not create separate printing/face identities.

## 4. Scryfall `otag:` mapping

### 4.1 Source acquisition and join

1. Read the latest Scryfall Bulk Data manifest and download the **Oracle Tags** JSONL.GZ object. The manifest's URL and `updated_at` are data; do not hardcode the daily timestamped URL.
2. Process only records with `type = "oracle"`. Exclude `illustration` tags entirely.
3. For each tag, read its stable UUID `id`, current `slug`/`label`, aliases, description, parent/child UUIDs and direct `taggings[]`. Each oracle tagging supplies `oracle_id`, `weight` (`very_strong`, `strong`, `median`, `weak`) and optional annotation.
4. Join taggings to the Oracle Cards/current reference-card population by `oracle_id` exactly. Do not join on card name or `scryfall_id`.
5. Store the original source identity and source snapshot, even when a tag is unmapped. Tag slugs may change; the UUID is the upstream stable key. Keep both source UUID and observed slug for auditability.

### 4.2 Mapping registry

Maintain a versioned mapping table/config artifact from `scryfall_tag_id` to one or more internal `taxonomy_slug`s, plus the mapping rationale and effective taxonomy version. The registry is reviewed when new/changed Tagger UUIDs appear. Mapping is explicit; no slug-substring translation or runtime LLM inference.

Initial mapping classes (the exact source UUIDs are resolved from the current Oracle Tags bulk file at implementation time; UUIDs are intentionally not guessed in this contract):

| Scryfall functional tag concept / `otag:` family | Internal vocabulary targets | Mapping treatment |
|---|---|---|
| Removal, board wipe, counter, protection, ramp, draw, tutor, recursion, discard, mill | `role.removal`, `role.board_wipe`, `role.counterspell`, `role.protection`, `role.ramp`, `role.draw`, `role.tutor`, `role.recursion`, `role.discard_opponent`, `role.mill` | Map broad function only when description/tag semantics match. A parent tag may need expansion through child IDs. |
| Sacrifice, sacrifice outlet, dies/death payoff | `action.sacrifice_self/other`, `role.sacrifice_outlet`, `event.permanent_dies`, `role.sacrifice_payoff` | Do not map generic “sacrifice” to both the action and death event unless source evidence warrants each. Keep Tagger annotation and weight. |
| Exile / casting from exile / impulse access | `zone.exile.access`, `action.play_from_exile`, `action.cast_from_exile`, `action.exile_top_for_access` | Only map fine-grained tags where the Scryfall description is specific enough. Broad “exile” is not enough to imply access or cast permission. |
| Tokens / Treasures / artifact sacrifice / artifacts matter | `resource.token.create`, `resource.token.create_treasure`, `resource.treasure.produce`, `resource.artifact.consume`, `condition.artifact_enters/leaves` | Keep token type and event distinctions. “Artifact matters” cannot by itself mean Treasure producer or consumer. |
| Graveyard / self-mill / cast from graveyard / reanimation | `zone.graveyard.self_fill`, `action.cast_from_graveyard`, `action.play_from_graveyard`, `action.return_from_graveyard`, `action.reanimate` | Avoid conflating filling, casting, recursion, and opponent graveyard interaction. |
| Spells, lands, combat, counters, creature types | Matching `event.*`, `condition.*`, `resource.counter.*`, `tribe.*`, and `role.*` slugs | Map only when a source tag's definition is functionally precise. Keep statically-derived type/keyword facts separately attributed. |

Tagger labels use four qualitative weights. Preserve the source value; do not translate it directly into model probability. Weight can support retrieval tie-breaking (very_strong/strong over median/weak), but cannot override contradictory rules text or make a wrong tag true. The canonical combined profile should retain separate provenance records if Scryfall and Haiku both support the same label.

### 4.3 Preliminary coverage measurement

A first, reproducible-source measurement was made from Scryfall's 2026-10-01 Oracle Cards and Oracle Tags bulk snapshots. It replaces the earlier planning range as a **preliminary measured join**, but the mapping is still a draft: 329 Scryfall tag slugs were grouped into broad internal functional families by their current tag names/descriptions. Individual mappings and edge cases have not yet had human accuracy review, so “mapped” means “matched by this draft map,” not “confirmed correct.”

| Stage | Distinct `oracle_id`s | Share | Meaning |
|---|---:|---:|---|
| Oracle Cards universe | 38,705 | 100% | Every canonical identity in this dated Scryfall snapshot. |
| At least one Scryfall Oracle Tag of any kind | 36,041 | 93.1% | Any Tagger evidence, including broad/specialized tags not necessarily useful to recommendations. |
| At least one tag matched by the draft functional map | 22,554 | 58.3% | Preliminary useful-label coverage under the 329-slug draft map. |
| Not matched by the draft map | 16,151 | 41.7% | Haiku fallback candidates if Oracle classifies the full Scryfall universe. This includes some cards that have Tagger labels, but those labels did not match the draft functional map. |
| Commander-legal identities in the snapshot | 32,116 | — | Useful comparison population for Commander-only recommendations. |
| Commander-legal identities matched by the draft map | 20,663 | 64.3% of Commander-legal | Preliminary coverage within Commander-legal cards. |
| Commander-legal identities not matched by the draft map | 11,453 | 35.7% of Commander-legal | Potential fallback population if the product deliberately limits tagging to Commander-legal cards. |

This supports the earlier rough 55–70% Scryfall-coverage estimate, but does not validate semantic accuracy. Some mapped source tags may be too broad, and some genuinely useful tags remain unmapped. The 100-card review must measure false positives and missed distinctions before the mapping is treated as reliable. Coverage for exact specialist labels (for example, “cast from exile this turn”) will be lower than “has at least one mapped label.”

The old 16-commander matrix remains absent. A separate 20-commander multi-build test set was selected at the owner's request; it is not a reconstruction of that historical set.

**Before full-batch spend:** finalize the UUID-to-vocabulary mapping; rerun exact coverage by each internal tag and commander-relevant mechanic; reconcile the complete Scryfall universe against the application's actual reference-card population; then update fallback counts and costs. Do not treat the preliminary broad-family counts as the final batch manifest.

## 5. Haiku fallback: one-off backfill and delta

### 5.1 Candidate selection

For the one-off backfill, enumerate the current supported `oracle_id`s from the canonical Oracle Cards/reference dataset and reconcile that list against the dated Scryfall snapshot before spend. Scryfall's 2026-10-01 Oracle Cards snapshot contained 38,705 identities; the app's actual reference-card population still needs an exact count. Send a card to Haiku when it has no usable mapped Scryfall tag, **or** when it lacks a requested fine-grained mechanic profile despite only broad Tagger labels. Provide canonical card name, full type line, mana/color identity where available, and all face names/types/oracle text. Do not send collection, user, deck, ownership, or private data; none is needed.

Avoid paying twice for cards already adequately represented. Batch work is idempotent by card `oracle_id` + oracle text hash + taxonomy/prompt versions. Reprints sharing an existing `oracle_id` do not trigger a new classification unless their canonical rules text changed.

### 5.2 Structured tool response (D-016)

Each request uses the Anthropic Message Batches API with `model: claude-haiku-4-5-20251001`, `max_tokens` sized to the profile, one card/request, and a **forced strict tool-use** call such as `submit_card_tags` (`tools: [{name, description, input_schema, strict: true}]`; `tool_choice: {type: "tool", name: "submit_card_tags"}`). The tool input is the entire machine-readable result; do not ask for JSON in prose or regex-parse text. Message Batches supports tool-use requests, and Anthropic documents strict structured tool use and Haiku 4.5 support [Anthropic Batch Processing and Structured Outputs docs, accessed 2026-10-02].

Proposed tool input fields:

```json
{
  "oracle_id": "UUID",
  "taxonomy_version": "card-tags-v1",
  "tags": [
    {
      "slug": "action.cast_from_exile",
      "confidence": 0.92,
      "evidence_face": "Prosper, Tome-Bound",
      "evidence_quote": "you may play that card this turn",
      "conditions": ["exiled_card", "this_turn"],
      "role": "enabler"
    }
  ],
  "unclassified_reason": null
}
```

Schema/validation requirements:

- `oracle_id` must equal the request's input oracle ID, not be selected or resolved by the model.
- `slug` must be an allowlisted internal vocabulary slug for this taxonomy version. Enforce after tool call; unknown slugs reject the full profile for retry/review rather than being silently inserted.
- `confidence` is in [0,1]; it is a model confidence estimate, not empirical calibration.
- Evidence quote must be a short verbatim span from supplied Oracle text; validate exact substring against the referenced face/text server-side. If no supported evidence, reject that label or mark uncertain.
- Conditions use a controlled schema/value vocabulary and cannot introduce a new tag. `evidence_face` must match one of supplied face names or be null.
- Empty tags are allowed only with a non-empty `unclassified_reason`. Omission from the response is not equivalent to an empty successful classification.
- Refusal, tool omission, truncation, invalid schema, source error, and no-match are distinct failure states. Retry only transient/API errors; put semantically unclassifiable cases in the honest-unknown state.

Local validation is required after model output: request/result identity match, schema parse, allowed slug/version, exact evidence quote, confidence range, face identity, duplicate collapse, and taxonomy conditions. No model output directly mutates a recommendation or deck.

### 5.3 Batch lifecycle

1. Freeze input snapshot and manifest (`input_snapshot_at`, Scryfall Oracle Cards version/date, Scryfall Oracle Tags timestamp, taxonomy version, prompt version, model ID, and per-card oracle-text hash).
2. Preflight a small test batch using the same tool/schema and verify successful strict-tool responses before creating the large batch. This step incurs model spend and needs owner approval.
3. Submit individual request records with unique Anthropic `custom_id` values incorporating run ID and stable oracle ID (within documented ID character/length limits). Save provider batch ID and request manifest before processing results.
4. Poll until `ended`, then stream JSONL results and match by `custom_id`, never input order. Message Batches usually complete under an hour, can expire at 24 hours, and results remain available for 29 days; persist results promptly [Anthropic Batch Processing docs].
5. Validate each record, group valid profile + tags per `oracle_id`, and commit each card's profile atomically using an idempotent upsert. Do not expose partially written labels. Failed requests remain retryable by status.
6. Reconcile counts: submitted = succeeded + errored + canceled + expired; valid writes + validation failures + unresolved = succeeded. Archive only run metadata and necessary structured outputs; retain no more raw prompt/output than needed under applicable provider retention rules.

### 5.4 Cost estimate

Anthropic's published Haiku 4.5 Message Batch prices are **$0.50 per million input tokens and $2.50 per million output tokens** (50% below the listed $1/$5 standard prices) [Anthropic Pricing docs, accessed 2026-10-02]. The calculation below uses one request per uncovered identity, 900–1,200 input tokens/card (fixed instructions/schema overhead plus card text), and 100–200 output tokens/card. Actual token counts must be measured on the preflight; forced tool/schema overhead and unusually long multi-face text can move the total.

| Backfill scope | Uncovered IDs under draft coverage | Base estimated batch cost | With 25% retry/validation allowance |
|---|---:|---:|---:|
| All Scryfall Oracle Cards IDs in the 2026-10-01 snapshot | 16,151 | $11.31–$17.77 | **about $14–$23** |
| Commander-legal IDs only | 11,453 | $8.02–$12.60 | **about $10–$16** |
| If the app's reference universe is about 30,000 IDs at the same draft coverage rate | about 12,510 | $8.76–$13.76 | **about $11–$18** |

These are planning calculations, not quotes or spend authorization. They exclude engineering/runtime/storage costs and do not include batch prompt-cache savings. The final fallback count depends on the reviewed mapping and the app's actual reference-card population; update the estimate before any paid batch. Whole-corpus Haiku-only classification would cost more and is not the proposed design.

## 6. Proposed Supabase storage contract (no migration in this task)

Card tags are shared global reference data, not user-owned data. They do not get `user_id`; one canonical semantic profile is shared across users. Apply authenticated read-only access and service-role-only writes, consistent with the existing reference taxonomy pattern [Confirmed: `supabase/migrations/20260803100000_create_ref_taxonomy.sql`]. Do not attach tags to `user_cards`, `deck_cards`, or a printing row.

### 6.1 `ref_card_tag_profiles`

One current profile envelope per canonical identity:

| Column | Type / contract | Purpose |
|---|---|---|
| `oracle_id` | UUID, primary key; Scryfall canonical identity (D-003) | Card key. No `scryfall_id` substitution. |
| `taxonomy_version` | text, not null | Vocabulary/mapping version for current tags. |
| `oracle_text_hash` | text, not null | Detect rules text changes and make delta classification idempotent. |
| `profile_status` | enum/check: `complete`, `partial`, `unclassified`, `needs_review` | Distinguish zero tags from missing/failed work. |
| `source_coverage` | JSONB, not null | Counts/status by source: Scryfall mapped/unmapped, model fallback, deterministic rules. |
| `classifier_model` | text, nullable | Exact model ID, e.g. Haiku ID; null when no model used. |
| `prompt_version` | text, nullable | Reproducibility and controlled reclassification. |
| `scryfall_oracle_tags_updated_at` | timestamptz, nullable | Upstream snapshot freshness. |
| `classified_at` | timestamptz, nullable | Most recent successful profile build. |
| `created_at`, `updated_at` | timestamptz | Audit lifecycle. |

Logical FK: `oracle_id` references the canonical identity in `ref_cards`. Before implementing that FK, verify `ref_cards.oracle_id` is UUID and unique; its uniqueness constraint is not established by the taxonomy migration inspected for this proposal [Approximate]. If it is not unique, use the actual canonical identity catalog/constraint rather than inventing a reference or joining to printing IDs. `oracle_id` is the sole primary key; no sequence ID is needed. Primary-key lookup serves per-card reads; `profile_status` and `updated_at` indexes are only warranted if the measured queue/delta query needs them.

### 6.2 `ref_card_tag_vocabulary`

The current `ref_taxonomy.category` check allows `archetype`, `mechanic`, `tribe`, `keyword`, and `color`, but not the separate `role` dimension [Confirmed: `supabase/migrations/20260803100000_create_ref_taxonomy.sql`]. Avoid forcing role labels into a misleading category. Proposed small shared registry:

| Column | Type / contract | Purpose |
|---|---|---|
| `slug` | text primary key | Stable internal slug, e.g. `action.cast_from_exile`. |
| `dimension` | text/check: `mechanic`, `role`, `plan`, `tribe`, `condition` | Separates tag semantics. |
| `display_name` | text not null | Human-readable label. |
| `definition` | text not null | Positive scope and disambiguation/exclusion guidance. |
| `taxonomy_version` | text not null | Vocabulary lifecycle/version. |
| `active` | boolean not null default true | Retire from new output without erasing historical evidence. |

Primary key: `slug` (slug is version-stable; taxonomy version records which definition/mapping produced a profile). Add btree `(dimension, active)` for vocabulary browsing. RLS is authenticated `SELECT` and service-role writes. No user ID. Do not duplicate rows here that can safely use `ref_taxonomy`; implementation should choose one source of truth and use the independent table only where current category constraints make `ref_taxonomy` semantically inaccurate.

### 6.3 `ref_card_tags`

One row per label evidence source, allowing independent Tagger and model evidence for the same internal label:

| Column | Type / contract | Purpose |
|---|---|---|
| `evidence_id` | UUID primary key, default-generated | Stable key for this provenance assertion. |
| `oracle_id` | UUID, not null, FK to `ref_card_tag_profiles.oracle_id` | Canonical card identity. |
| `taxonomy_slug` | text, not null, FK to the chosen vocabulary registry (`ref_card_tag_vocabulary.slug` for this proposal) | Stable internal tag slug. |
| `evidence_source` | text/check: `scryfall_otag`, `haiku`, `deterministic`, `human` | How this label was evidenced. |
| `source_tag_id` | UUID, nullable | Scryfall Tagger UUID; null for model/other evidence. |
| `source_tag_slug` | text, nullable | Scryfall slug snapshot for diagnostics; not a join key. |
| `source_weight` | text/check, nullable | Original Tagger weight (`very_strong`, `strong`, `median`, `weak`). |
| `confidence` | numeric(4,3), nullable, constrained 0–1 | Model/human certainty where applicable; not a translation of Tagger weight. |
| `evidence_face` | text, nullable | Card-face name whose text supports this evidence. |
| `evidence_quote` | text, nullable | Short text excerpt or Tagger annotation; limited to relevant card/source evidence. |
| `conditions` | JSONB, not null default `[]` | Structured conditions (turn/timing, controller, source zone, object type, play/cast distinction, token status). |
| `run_id` | text, nullable | Backfill/delta/manual review lineage. |
| `taxonomy_version` | text, not null | Internal mapping/classification version. |
| `created_at` | timestamptz | Evidence ingestion timestamp. |

**Primary key:** `evidence_id`. For idempotence, add separate partial unique indexes for Scryfall evidence `(oracle_id, taxonomy_slug, source_tag_id, taxonomy_version)` where `evidence_source = 'scryfall_otag'` and `source_tag_id IS NOT NULL`, and for non-Scryfall evidence `(oracle_id, taxonomy_slug, evidence_source, run_id, taxonomy_version)` where `evidence_source <> 'scryfall_otag'` and `run_id IS NOT NULL`. Preserve multiple evidence rows when provenance differs; merge/dedupe at read time into a tag profile. **Foreign keys:** profile FK and vocabulary slug FK above; Tagger UUID is external and has no database FK. **Indexes:** btree `(taxonomy_slug, oracle_id)` for retrieving candidates by mechanic; partial btree `(source_tag_id, oracle_id)` for source refresh/reconciliation; optional GIN on `conditions` only if actual queries use condition containment. Avoid duplicating tags into per-user storage.

The vocabulary/profile/evidence tables use RLS: `SELECT` for `authenticated`; all writes/updates/deletes restricted to `service_role`. The tag-profile and its evidence-row replacements for one `oracle_id` commit in one transaction/upsert unit. The importer processes one identity atomically and is idempotent by card ID/version/source evidence; failures leave the prior complete profile intact and mark/run-log failure separately rather than publishing half the tags.

### 6.3 Provenance/run ledger

Use a small `ref_card_tag_runs` ledger (or equivalent durable run record) to store run ID, operation (`tagger_refresh`, `backfill`, `set_delta`, `reclassify`), source snapshot IDs/timestamps, taxonomy/prompt/model versions, Anthropic batch ID (nullable), queued/succeeded/failed/unclassified counts, start/end status, and error summary. Primary key `run_id`; no user ID. Service-role write, authenticated read if operational visibility requires it. Avoid storing API credentials or full private data. Raw tool result retention is short-lived and should not be the source of truth; normalized tag provenance persists.

## 7. New-set delta and ongoing refresh

This is a job design, not an implementation schedule:

1. On a scheduled daily check and after new Scryfall set/reference-data ingestion, fetch the Scryfall Bulk Data manifest. Refresh the Oracle Tags snapshot when its `updated_at` changes; also ingest new oracle identities from current Oracle Cards/reference data.
2. Compare normalized source UUID/tagging pairs to stored Tagger evidence. Insert/update changed mappings or taggings; retain removed source taggings as removed in the refresh transaction/run history so they do not persist indefinitely. Recompute impacted card profiles only.
3. Identify new card `oracle_id`s with no profile, plus existing identities whose canonical oracle-text hash changed. New reprint rows with an already-known `oracle_id` and unchanged text do not need Haiku.
4. Apply the reviewed UUID→internal-slug map. Enqueue only uncovered or semantically undercovered profiles for Haiku Message Batches. Use the same forced strict tool and validation contract; preserve previous good profile until the new one validates.
5. A vocabulary/prompt change creates an explicit reclassification cohort keyed by `taxonomy_version` / `prompt_version`; do not silently rewrite all profiles. Use measured deltas, preserve prior versions in run artifacts or an audit history as decided during implementation.
6. Monitor unmapped Scryfall UUID growth, coverage by set and mechanic, unknown outputs, request failures, average tokens/cost, and time-to-complete. Alert/report rather than silently claim full coverage.

New Scryfall rules text does not itself authorize runtime recommendation changes: the profile must pass validation and remain separate from legality/availability. Set jobs must follow Scryfall rate limits and bulk-data terms; prefer bulk files over individual card requests.

## 8. Accuracy check: hand-labelled sample of 100 cards

Before relying on tags for commander ranking, create a fixed, versioned set of **100 oracle identities**, sampled from the same reference universe. This is an acceptance experiment, not executed in this design task.

A proposed concrete 100-card candidate list for owner review is recorded in `docs/oracle/reports/2026-10-02-architect-card-tagging-sample-100.md`. It is based on Scryfall bulk snapshots dated 2026-10-01 and contains four groups of 25: useful existing Tagger labels, possible mapping gaps, Prosper/Korvold mechanic contrasts, and edge/empty-tag cases. Its mapping-dependent group membership is provisional until the internal mapping is finalized. The candidate list has not been hand-labelled or sent to Haiku.

### Sampling and labels

Use four mutually exclusive strata of 25 cards, selected with a recorded random seed and stratification rules:

1. 25 with mapped Scryfall Tagger evidence (include high- and low-weight mappings).
2. 25 with no useful mapped Tagger label (the fallback population).
3. 25 intentionally enriched for commander-critical distinctions: exile access/cast vs play, Treasure creation vs artifact payoff, sacrifice vs dies, tokens, graveyard/cast permissions, and conditional timing/controller text.
4. 25 edge cases: modal or multi-face text, noncreature cards/lands, self-discard vs opponent discard, token/nontoken conditions, uncommon wording, and cards expected to remain unknown.

If a selected card belongs to multiple strata, assign it by this priority order and draw a replacement in the vacated stratum, preserving the seed. Do not tune the vocabulary/prompt on the final 100; use a separate development sample if iteration is needed.

Use an assistant first pass followed by an owner confirmation pass. The assistant drafts plain-language labels from the supplied Oracle text only; it must not see Scryfall Tagger labels or Haiku output for these cards. The owner accepts, edits, or marks each suggestion unsure against the card text. Lock the owner-confirmed labels before showing either system's results. Keep “not present,” “uncertain/unsupported,” and “not applicable” distinct. This is a practical human-confirmed answer set, but it is less independent than two people labelling from scratch; for a stronger accuracy claim, have a second reviewer independently label a blind random subset (proposed 20 cards) and compare agreement before scoring. Record taxonomy version, Scryfall snapshot, label-guide version, owner edits, and unresolved disagreements.

### Reported metrics and proposed gates

Compare **Tagger-mapping-only**, **Haiku-only on the Tagger fall-through**, and **combined output** separately. Report per-tag TP/FP/FN, micro and macro precision/recall/F1, exact card-level label-set match, coverage/non-empty rate, unknown accuracy, and confidence bins (descriptive only at N=100). For critical mechanic pairs, report confusion counts explicitly: cast vs play from exile; exile access vs exile removal; sacrifice vs dies; create Treasure vs use Treasure; graveyard fill vs cast/reanimate; trigger vs generic card type.

Proposed pre-release criteria, subject to owner review:

- Combined micro tag precision **≥0.90** and recall **≥0.80** across the sample.
- Macro F1 **≥0.75** for labels with at least 5 gold examples; report rarer labels separately rather than treating “not measured” as pass.
- Precision and recall **≥0.90** for the critical distinctions above, with **zero** false-equivalence errors for cast/play and sacrifice/dies in the labelled sample.
- Exact evidence-quote validation passes for **100%** of emitted Haiku labels; invalid/unsupported tool responses are never published.
- Honest-unknown precision ≥0.80 among cases the annotators mark unsupported/ambiguous, and profile output never invents an identity or printing.

These are proposed gates, not confidence intervals or proof of universal accuracy. With 100 cards, estimates are noisy, particularly per tag. If gates fail, correct the explicit mapping/prompt, then evaluate on a new held-out sample; do not tune and report on the same 100. Keep an ongoing regression set with special rule-condition cases, and periodically refresh a held-out set by set release.

## 9. Recommendation flow integration boundary

The tag profile is candidate retrieval evidence, not the recommendation score:

1. Retrieve candidates from card mechanics/roles and commander-supported plans/packages.
2. Filter real canonical card identities and known Commander legality/color identity using reference facts; unknown facts remain explicit and do not become “legal” by model assertion.
3. Re-rank against the actual deck plan, needs/gaps, mana curve, deck contents, owner preferences and card-card support. Avoid double-counting one event under multiple synonymous tags; avoid using popularity as a substitute for mechanic fit.
4. Validate any displayed recommendation against card identity, color identity, rules text, and current deck/collection facts. Collection, printing, finish, Original/Proxy, Available/Unavailable/Alt available/Proxy available/Unowned, and deck assignments come from existing data, never the tagger/model output (D-003, D-004, D-012, D-016, and approved availability decisions).
5. Jev may be considered only in future for runtime deck-fit scoring after a separate owner-approved experiment. It is not part of ingestion, source mapping, coverage claims, or the backfill.

Tagging cannot prove complete coverage of all emergent Magic interactions. A new commander or new mechanic may be sparse; return relevant evidence plus honest unknowns, and don't infer preferred archetype when the owner hasn't supplied one.

## 10. Proposed 20-commander coverage matrix

The earlier T-19 16-commander matrix artifact is not present in this checkout [Confirmed: `docs/oracle/status.md`; repository search on 2026-10-02]. Per the owner's follow-up, this contract supplies a fresh **20-commander evaluation matrix** based on `docs/deck-taxonomy.md` and the T-19 research brief. It is a representative test set, not a claim that these are the only viable builds or an endorsement of every archetype as equally popular. Archetype/theme names follow the deck taxonomy; mechanic coverage is the evidence the card-tag pipeline must make retrievable.

| Commander | Plausible build variants to test (archetype + theme) | Tag families this tests |
|---|---|---|
| Prosper, Tome-Bound | Exile-value/spellslinger + Exile; Treasure/aristocrats + Treasure/Sacrifice | Exile access, cast vs play, this-turn conditions, Treasure production/consumption, spell-cast payoff |
| Korvold, Fae-Cursed King | Aristocrats + Sacrifice/Treasure; land-value/combo + Lands/Graveyard | Sacrifice vs dies, permanent sacrifice, Treasure as expendable artifact, draw/counter payoff, land-to-graveyard loops |
| Atraxa, Praetors' Voice | Counters/proliferate; Superfriends; Infect; stax/control | Counter types, proliferate, loyalty, poison, resource restrictions, end-step/conditioned triggers, planeswalker support |
| Edgar Markov | Vampire aggro + Kindred:Vampires/Tokens; Vampire aristocrats + Sacrifice/Lifegain | Typal enablers/payoffs, token creation, attack/combat, death triggers, life gain/drain |
| Muldrotha, the Gravetide | Reanimator/value + Graveyard; permanents/lands + Graveyard/Lands | Self-mill, permanent-type permissions, replay/cast from graveyard, zone timing, recursion |
| Wilhelt, the Rotcleaver | Zombie go-wide + Kindred:Zombies/Tokens; Zombie aristocrats + Sacrifice/Graveyard | Typal, decayed tokens, sacrifice outlets, death triggers, graveyard recursion |
| Breya, Etherium Shaper | Artifact combo + Artifacts/Tokens; artifact control/value + Artifacts | Artifact/token creation, artifact sacrifice, activated outlets, artifact-count conditions, combo enablers (not global combo labels) |
| The Ur-Dragon | Dragon aggro + Kindred:Dragons; Dragon reanimator + Kindred:Dragons/Graveyard | Typal, cost reduction, attack triggers, cast vs enter triggers, large-creature recursion |
| Teysa Karlov | Aristocrats + Tokens/Sacrifice; death-trigger combo + Tokens | Creature dies vs sacrifice, death-trigger doubling, token creation, drain/payoff roles |
| Aesi, Tyrant of Gyre Strait | Landfall/ramp + Lands; sea-creature value + Lands/Kindred | Landfall, extra land plays, land-to-battlefield ramp, draw triggers, creature-type conditions |
| Niv-Mizzet, Parun | Spellslinger/control + Spells; wheels/combo + Spells/Wheels | Cast-spell events, draw/discard, opponent draw triggers, spell-copy, combo relationships as deck-level only |
| Shorikai, Genesis Engine | Vehicles/control + Vehicles/Artifacts; artifact-token combo + Artifacts/Tokens | Vehicle tokens, crew/tap, artifact triggers, looting vs draw, untap and repeatable activation |
| Chatterfang, Squirrel General | Squirrel go-wide + Kindred:Squirrels/Tokens; aristocrats + Tokens/Sacrifice | Token multiplication, creature-token vs other tokens, sacrifice outlet, death/payoff, typal |
| Yuriko, the Tiger's Shadow | Ninja tempo + Kindred:Ninjas; topdeck damage/control + Spells/Topdeck | Ninjutsu, combat damage to player, top-deck manipulation, reveal/mana-value payoff, evasion |
| Pantlaza, Sun-Favored | Dinosaur typal + Kindred:Dinosaurs; discover/blink value + Dinosaurs | Discover vs cast, ETB/blink, once-per-turn trigger, creature type, large-creature payoff |
| Krenko, Mob Boss | Goblin go-wide/aggro + Kindred:Goblins/Tokens; Goblin aristocrats + Goblins/Sacrifice | Repeatable token creation, tap/untap, creature count scaling, sacrifice and death payoffs |
| Lathril, Blade of the Elves | Elfball/ramp + Kindred:Elves; Elf go-wide/drain + Elves/Tokens | Mana dorks, typal density, token creation, tap-count conditions, life-drain payoff |
| Sram, Senior Edificer | Voltron + Equipment; aura-based Voltron + Enchantments | Equipment/aura attachment, equip actions, commander-damage combat, cast-triggered card draw, protection and evasion |
| The Gitrog Monster | Lands/graveyard value + Lands/Graveyard; dredge/combo + Graveyard | Land sacrifice vs land leaving, land-to-graveyard triggers, draw, self-mill/dredge, combo links at deck-level |
| Henzie "Toolbox" Torre | Blitz/ETB value + Graveyard; sacrifice/aristocrats + Sacrifice/Creatures | Blitz, haste/attack, ETB and dies triggers, sacrifice timing, reanimation, end-step/temporary conditions |

Each commander appears with at least two plausible variants so evaluation tests **build identity**, not commander-name lookup. This set samples aggro, aristocrats, blink, combo, control, infect, reanimator, spellslinger, stax/Superfriends, wheels, vehicles, and Voltron; themes include artifacts, counters, enchantments/equipment, exile, graveyard, lands, planeswalkers, spells, sacrifice, tokens, Treasures, and multiple kindreds. It is representative rather than exhaustive of every entry in `docs/deck-taxonomy.md`. Not every named mechanic is already an independent vocabulary entry: where a row exposes a gap (e.g. energy, discover, blitz, ninjutsu, decayed, or dredge), add a tightly defined slug or controlled mechanic value before claiming the test is covered.

**Validation procedure:** for each commander/build row, annotate positive examples, near-miss negatives, and required supporting roles/packages. Confirm each need maps to one or more internal tags; specifically test Prosper vs Korvold, Atraxa counters vs Superfriends, Muldrotha graveyard vs Aesi lands, and Wilhelt typal vs aristocrats. Reconcile proposed mechanic names against verified card rules and deck taxonomy. The 100-card hand-labelled sample measures tag accuracy; this commander/build matrix separately measures whether the available tags express the intended range of deck needs. The original historical 16 can still be compared if later supplied, but is not a blocker for this proposed evaluation set.

**Owner review materials:** before running any paid backfill, present the 20 commanders and their build variants as a plain-language review list so the owner can flag implausible or missing builds. The candidate list is `docs/oracle/reports/2026-10-02-architect-card-tagging-sample-100.md`; the assistant's plain-English first-pass suggestions for all 100 cards are in `docs/oracle/reports/2026-10-02-architect-card-tagging-first-pass.md`. The CSV worksheet is `docs/oracle/reports/2026-10-02-architect-card-tagging-review-sheet.csv`; it has one card per row, a Scryfall link, full Oracle text, and blank owner decision/correction fields. The first-pass list and worksheet use the same order. The first pass is intended to be checked against card text, not copied from Tagger/model labels. After the owner locks the answer set, reveal Scryfall labels and (if later approved and run) Haiku labels, confidence, disagreements, and an explanation for each mismatch or unknown. Include all 100 cards, not only aggregate scores. Keep internal UUIDs in a separate technical column or omit them from the owner view. The first-pass suggestions and blank confirmation fields are prepared; no Scryfall/Haiku evaluation or paid model call has run.

The historical 16-commander matrix remains unavailable in this checkout. The new 20-commander matrix above is the proposed evaluation set requested by the owner and should be treated as its own set, not as a reconstruction of the historical list. Row-by-row tag coverage across these 20 is now specified; factual mechanic examples still require rules verification when the evaluation set is assembled.

## 11. External references

- Scryfall, [Tags API](https://scryfall.com/docs/api/tags) — oracle tag object, UUIDs, hierarchy, weights, `oracle_id` tagging, and community-maintained caveat. Accessed 2026-10-02.
- Scryfall, [Bulk Data](https://scryfall.com/docs/api/bulk-data) — Oracle Tags and Oracle Cards bulk files, daily manifest and bulk refresh guidance. Accessed 2026-10-02.
- Scryfall, [Tagger Tags and `otag:` syntax](https://scryfall.com/docs/tagger-tags) — functional oracle-tag search syntax. Accessed 2026-10-02.
- Anthropic, [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing) — batch limits, asynchronous lifecycle, 24-hour expiry, 29-day result availability, tool-use support, and 50% batch rates. Accessed 2026-10-02.
- Anthropic, [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — strict tool use/structured output and Haiku 4.5 model support. Accessed 2026-10-02.
- Anthropic, [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — Haiku 4.5 standard/batch token prices and tool-use token overhead. Accessed 2026-10-02.
