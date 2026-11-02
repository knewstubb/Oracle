# Advisor tools and safe proposals (T-36)

Status: **architecture proposal complete; acceptance pending owner and final T-28 review**.  
Date: 2026-10-10. Source checkout: task-t36, revising the T-15 advisor contract with owner answers D-034, D-035 and D-036.
This is a bounded M2 handoff, not implementation approval. No app, database,
schema, provider, deployment or milestone change is made.

Companions: [reference types](advisor-tools.types.ts) and
[pure offline examples](advisor-tools.examples.ts). Types make the model/server
boundary and apply/undo semantics reviewable; examples exercise that boundary without
credentials, network, database access or an app server. Neither is an application
handler or a replacement for T-28.

Normative labels throughout:
**[Approved]** locked decision or explicitly authorised M2 boundary;
**[Enforcement]** necessary technical constraint to preserve that boundary;
**[Proposal]** design awaiting contract acceptance;
**[Owner gate]** visible behaviour requiring confirmation.
`[Confirmed: path]` means inspected local source, not observed hosted behaviour.
`[Approximate]` marks unverified deployed state.

## 1. Smallest coherent delivery and boundaries

**[Approved]** Advice returns structured recommendations and may apply them directly
to the deck. Every AI-driven change is recorded with `source = 'ai'` (D-009) and is
undoable as a single operation. D-001, D-003, D-004, D-007, D-016 and D-025 through
D-039 take precedence over either draft.

**[Approved]** Deliver one existing sidebar journey first: "How can I improve this
Commander deck?" using the owned deck, verified commander(s), a bounded real-card
candidate pool, explicit preferences, T-28 availability, and at most ten suggestions.
Reuse `/api/oracle/chat`, the provider adapter/tool loop and sidebar transport.
Collection context can answer factual ownership questions and discuss a *selected*
commander using the same facts; discovering/ranking commanders from the whole
collection is a subsequent M2 slice, not a newly built recommendation platform.
Without a selected commander it asks for context rather than inventing one.

**[Approved]** M2 owns accepting add/remove/swap and undo. Each accepted suggestion
produces one durable, undoable operation receipt with `source = 'ai'`. A proposal
carries `source: ai` as provenance and an executable action descriptor derived by
the server; the model itself never writes to the deck. Optional cuts and packages
are discussion context only until explicitly applied.

**[Enforcement]** The model cannot set card names/IDs/text, ownership labels,
copy eligibility, prices, provenance timestamps, validation outcomes or action
descriptors. Server joins those from the bound context. Foreign keys, bad shapes,
unsupported output, duplicate suggestions or invented claims fail validation.

## 2. Source findings that change the implementation

| Surface | Verified local behaviour and required reuse boundary |
|---|---|
| Sidebar | `OracleContext` consumes `add_cards`/`remove_cards` and POSTs to `cards/batch` without a distinct confirmation. The registry tools themselves return "Added"/"Removed" text; they do not currently call the placement RPC. Stop both the model capability and browser event path, not just one. [Confirmed: src/contexts/OracleContext.tsx; src/lib/tool-registry.ts; src/lib/tool-executor.ts] |
| Tool permissions | Registry filtering removes editing tools only for listed exploration contexts; `executeTool` itself has no capability restriction. An advisor-owned allowlist must be enforced at dispatch, independent of client-supplied context. [Confirmed: src/lib/tool-registry.ts] |
| Deck context | `get_deck_cards` checks `decks.user_id`, then reads slots, metadata and prices. It omits face text and commander flags, parses categories as an object, and uses quantity fallback. Keep the ownership check; replace the lossy projection, not the full repository. [Confirmed: src/lib/tool-registry.ts] |
| Collection | Repository user scoping is optional; ownership filters out proxies, hard-codes `foil: false`/`set_code: null`. It is not a T-28 availability source. [Confirmed: src/lib/card-repository.ts] |
| Refresh | Upgrade refresh authenticates but checks deck existence without owner filtering, deletes old content, writes `[]` and returns success. Its UI shows a success toast on HTTP success. [Confirmed: src/app/api/decks/[id]/upgrade/refresh/route.ts; src/components/UpgradeTab.tsx] |
| Adapter | Streaming strips DSML-like text and skips malformed JSON tool calls. Non-streaming has a regex DSML parser as well as cleanup; therefore T-19's "dropped tools" finding is not identical across both paths. Both must use native structured calls or explicit failure. Streaming also initialises arguments from a first delta and appends that delta again when it contains arguments. Include a first-chunk test. [Confirmed: src/lib/adapters/deepseek-adapter.ts] |
| Loop | API failure emits an error but returns empty text; timeout/iteration exhaustion makes a best-effort call without tools. These are not successful validated recommendations. [Confirmed: src/lib/tool-executor.ts] |
| Preferences | Missing preferences are inserted as defaults; read failure returns defaults. Advisor reads must not call this write-on-read path. [Confirmed: src/lib/user-preferences.ts] |
| Identity/rules | `resolveOracleIdFromPrinting` distinguishes missing mapping from query failure. `scryfall-client` has exact-name lookup and request pacing, but its type omits oracle ID and faces. `commander-resolver` handles pairing concepts but includes fuzzy/name heuristics. Reuse discrete lookup/parsing helpers only after exact identity validation; do not take their current output as a legality certificate. [Confirmed: src/lib/identity-resolver.ts; src/lib/scryfall-client.ts; src/lib/commander-resolver.ts] |
| Retrieval | Build data access already exists but some failures become `null`/`[]`. A selected build must match the resolved commander; no "most popular" substitution for an unstated plan. [Confirmed: src/lib/commander-build-data.ts] |
| Prices | `price-store` reads Scryfall columns and uses a 48-hour threshold; the migration ledger explicitly drops `card_kingdom_prices`. D-035 chooses Scryfall estimates for advisor buy prices. [Confirmed: src/types/supabase.ts; src/lib/price-store.ts; supabase/migrations/20260730070439_drop_legacy_tables.sql] |

No new vendor audit, broad vulnerability audit or deployed-system certification
was performed. Unscoped legacy AI/session/action paths reported by T-19 remain
separate verification work before reuse or multi-user release. Do not rewire the
unmounted `/api/ai/recommend`, `/api/ai/brew/*` or deck-chat path to bypass this contract.

## 3. Fact contract and exact source resolution

### 3.1 Facts are not model output

**[Enforcement]** A `Fact<T>` is either known with evidence and freshness, or
unknown with a reason and attempted sources. A known value can be stale or have
unknown freshness. "Known" is not "current". Empty arrays mean a successful,
complete lookup found none; null only has the explicitly documented meaning.
Missing, failed, unsupported, ambiguous and unset are not interchangeable.

Each evidence record carries source, locator, observation time, underlying
source-update time (nullable), and version (nullable). Model interpretation is
labelled `model`, never an authoritative rules/ownership source. A repository
read timestamp cannot become the original source-update timestamp.

**[Proposal]** Freshness policy v1:

| Fact | Current-use requirement | Stale/unknown handling |
|---|---|---|
| Identity | Exact source mapping and matching name/ID; recheck if source disagrees | Ambiguous/mismatched identity blocks that candidate; never replace canonical ID with printing ID |
| Rules, faces, Commander legality | Validated Scryfall response or complete, timestamped public-facts cache checked within 24 hours; carry text hash and observation time | Attempt bounded refresh. If unavailable, exclude from validated recommendations; explain missing facts. Old banned insight never outranks current legality |
| Commander eligibility/pair | Current member facts plus a supported, versioned deterministic pairing rule | Unknown/illegal pair blocks deck-specific suggestions; do not reduce to first commander |
| Deck | One complete owner-scoped read, deterministic revision hash; re-read relevant deck/strategy input before final result | Changed input returns `stale_context`; no implicit regeneration loop |
| Availability | T-28 successful coherent snapshot, matched keys/deck revision, still valid at emission | T-28 owns expiration policy; stale/failed ownership is shown as such, not any of the five labels |
| Price | Per-quote source time, printing and finish; 48 hours maximum for "fresh" | Show dated indicative stale price or explicit unknown. Missing metadata is not $0 or fresh |
| EDHREC/build/guide | Original ingestion/publication metadata when available | Old/unknown dated evidence can help retrieval but cannot certify rules, availability or relevance |
| Preferences | Explicit scoped record or explicit turn instruction | Unset stays unset; lookup failure stays failed; no insert and no assumed policy |

The 24-hour rules cache is a proposed engineering bound, not an assertion of
instant ban-list accuracy. Copy changes can occur immediately after a read;
"as of" availability is not a reservation. T-28 supplies a snapshot validity rule,
not a promise that a copy will remain free.

### 3.2 Existing fields versus proposed projections

| Needed projection | Exact resolution and gap |
|---|---|
| Deck identity and scope | `decks.id` with `user_id = authenticated user`; format from `decks.format`. `commander_name`/`colour_identity` are display/fallback hints, not authority for current pair identity. [Confirmed: src/types/supabase.ts] |
| Main/Maybeboard list, quantities | All owner-scoped `deck_cards` rows, including `id`, `quantity`, `is_commander`, `scryfall_id`, `copy_id`, categories. T-28 must supply reviewed relation/coverage normalisation. No independent category heuristic: D-005/D-018 require the separate relation, while current generated rows have no explicit relation column. Null/zero/negative/fractional quantities are anomalies, not silently changed to 1. [Confirmed: src/types/supabase.ts; docs/oracle/contracts/card-state-actions.md] |
| Canonical identity | Slot printing -> `ref_printings.scryfall_id` -> `oracle_id`; owned identity -> scoped `user_cards.oracle_id`. Reuse `resolveOracleIdFromPrinting`. Without printing, use exact canonical name lookup, then require matching public oracle ID; fuzzy results are choices to resolve, never confirmation. No "first match" or model-made UUID. [Confirmed: src/lib/identity-resolver.ts; src/types/supabase.ts] |
| Commander selection | Resolve all main-list `is_commander` rows; cross-check `decks.commander_id` -> `ref_commanders`/`ref_commander_cards`. Stored selector-only decks may resolve their exact referenced members when slot flags are absent. Any conflict, missing member or fuzzy-only match yields unknown; do not rewrite rows. [Confirmed: src/types/supabase.ts; src/lib/commander-resolver.ts] |
| Canonical rules | `ref_cards` has name/text/type/keywords but no oracle ID, structured faces, rules hash or freshness; `ref_printings` supplies printing-to-oracle mapping, layout and stored legality. Proposed richer DTO comes from exact public Scryfall fetch/validated cache, not a join on approximate name or model recall. [Confirmed: src/types/supabase.ts; src/lib/scryfall-client.ts] |
| Printing/finish/copy | `user_copies.id`, `printing_id` (Scryfall printing), `is_proxy`, `finish` independent; `card_id` links scoped `user_cards`. Unknown finish remains unknown, not nonfoil; proxy identity inconsistencies involving `proxy_for_card_id` go to T-28, not an advisor fallback. [Confirmed: src/types/supabase.ts] |
| Availability/location | Reviewed T-28 adapter only; actual holding slot and recorded `user_locations`, including unknown location. Do not derive from legacy `ownership_status`, `allocate`, `is_active`, deck membership or name-only ownership. [Confirmed: src/types/supabase.ts; src/lib/card-repository.ts] |
| Preferences/plan | Read `deck_strategy` fields with deck and user scope; exact turn instruction overrides that field for this turn only, then deck setting, then an explicitly supplied global preference. Invalid/contradictory values become unknown. `user_preferences` is absent from generated types and read path has autogenerated defaults, so existing values cannot be assumed owner-confirmed. [Confirmed: src/types/supabase.ts; src/lib/user-preferences.ts] |
| Candidate evidence | Selected `decks.build_id` -> build/commander link -> `ref_build_cards`; existing knowledge guides and scoped owned canonical IDs can contribute candidates. Community inclusion/synergy and guide text retain provenance, not factual authority. [Confirmed: src/lib/commander-build-data.ts; docs/oracle/contracts/ai-recommendations-assessment-2026-09.md] |
| Price | `ref_printings.price_usd`/`price_usd_foil` and per-row `updated_at` are Scryfall indicative prices. D-035 uses these for advisor "buy" estimates, clearly labelled. Etched price unsupported unless a verified source distinguishes it. Never relabel foil or market-average values. [Confirmed: src/types/supabase.ts; src/lib/price-store.ts] |

**[Enforcement]** Public requests send only public card identifiers/search terms,
never user IDs, copy locations, private deck text or whole collection exports.
Existing model use may receive the minimum scoped deck facts needed for advice,
within existing approval; no new provider/private-data destination is introduced.
Copy IDs/locations remain server/client display data unless essential to the question.

### 3.3 Face-aware and pair-aware facts

**[Enforcement]** A canonical card has one oracle ID; all face records have an
index, name, type, text, mana cost and colours. Normalize a single-face card to
one face. Multi-face data must actually contain the required faces; no fabricated
blank face. Preserve layout and top-level colour identity and mana value.
Faces are not extra deck slots. Mana-value/land-count calculations use rules-aware
deterministic logic; multi-face role labels alone do not change counts.

Pairing validates both identities, current legalities and the actual permission:
Partner, named Partner with, Friends forever, Choose a Background plus a Background,
or Doctor's companion plus a qualifying Doctor. A colour union alone does not
make an arbitrary pair legal. Unimplemented/new permissions are unknown.
Backgrounds need not be creatures. Standalone commander eligibility includes
specific "can be your commander" permissions, not just Legendary Creature.

Example: Wilson + Candlekeep Sage permits blue and green; checking Wilson alone
would wrongly reject Mystic Remora. Shatterskull Smashing's sorcery face can support
removal and its other face a land choice; it is still one canonical card.

## 4. Narrow T-28 consumer boundary

**[Approved]** Preserve exactly Available / Unavailable / Alt available /
Proxy available / Unowned. Free requested original takes precedence over free
alternate original, then free proxy; preserve all other usable choices. Placement
and Original/Proxy are separate facts. Existing free proxy means reuse, not create.
Generic basics create no inventory or shortage demand. Original shortages include
proxy-filled requirements; proxies never cancel the need for originals.

**[Approved]** Advisor consumes T-28's read-only availability boundary.
`AdvisorAvailabilityRequest` accepts canonical `oracleId`, nullable requested
printing ID and optional deck context. The authenticated user is server-only.
With a deck context this represents an ordinary outstanding tracked requirement;
Sleeved/generic/optional state is separate, not relabelled Unowned. Without a deck,
report free/held copies for that canonical card without implying a slot exists.

`AdvisorAvailability = ReadState<AdvisorAvailabilityFacts>` returns one of the
five approved labels, reasons/holder decks, separate original/proxy ownership,
exact copy IDs, printing, finish and recorded location, excluded-copy count and
observation. Unknown essential printing/finish or failed joins make the read
unknown/partial, not absent inventory or a guessed alternate. A known null recorded
location is `not_recorded`, never an invented shelf. A pending exclusion is not
Unowned. The advisor may describe a non-executable unknown fact but cannot infer
that a copy is movable. It consumes the same T-28 predicate, not its own
shortage/readiness logic. It gets **no action descriptors, operation IDs, undo
tokens or writes**. Observation tokens here are read provenance, never write
authorisation.

**[Enforcement]** Advisor does not calculate supply, readiness, original shortage,
excluded-copy eligibility, or donor impact. It does not decide shortage deck
scope, Casual readiness, proxy printing or generic/tracked conversion. If shortage
advice is later wanted, consume a separately accepted T-28 original-shortage result;
absence is unknown, not "buy one". "Unowned" is a fact, not a purchase instruction.
A free proxy does not mean an original is owned or that original shortages vanished.

**[Enforcement]** Group only fresh applicable facts into the five approved labels.
Stale/unknown/not-applicable rows remain ungrouped with an explicit explanation;
this does not create a sixth availability meaning. Original and proxy details stay
visible. UX decides presentation under T-16/D-012 through D-014, not this document.

## 5. Requests, tools, responses and errors

### 5.1 Transport and ownership

**[Proposal]** Version the existing `POST /api/oracle/chat` request with
`schemaVersion: advisor-v1`; companion `AdvisorRequest`/`AdvisorEvent` define the
new contract. No parallel chat endpoint. Authenticate before reading context or
opening the SSE stream. Client deck name/colours/history cannot authorize reads
or override facts. Validate positive integer deck/slot IDs, UUID-shaped real card
IDs, session ownership, message length (1..4,000), request ID length (1..100).
Only server-loaded, owned session history is trusted for continuity; it is still
conversation, not evidence. Runtime schemas reject extra model-output fields.

Every user-owned query explicitly filters `user_id`; slot/strategy/copy/location
joins also prove parent ownership. A known owned parent is not permission to accept
arbitrary child IDs. `requireAuth` remains mandatory. Service-role access bypasses
RLS, so RLS alone is insufficient. Cross-owner/missing decks or sessions return the
same 404. Query failure is 503, not not-found. Re-check scope on every tool dispatch.

The internal `contextId` binds authenticated user, request, deck revision, candidates,
commander and evidence. It is not supplied as authority by the model. Read-only tools
may reference only keys in that context. No raw SQL, arbitrary URLs or unrestricted
private-deck search tool.

### 5.2 Advisor-only tools

| Proposed tool | Bounded input/output | Existing surface to extend |
|---|---|---|
| `advisor_get_context` | Bound context ID -> fact-wrapped deck/commander/preferences; collection mode returns `unsupported` for this deck-only tool rather than a fake deck | `get_deck_cards` reader and scoped context assembly |
| `advisor_get_card_facts` | 1..100 supplied candidate keys -> one known/unknown factual record per key | exact Scryfall/printing resolvers |
| `advisor_get_availability` | 1..100 supplied candidate keys -> T-28 read projections | reviewed T-28 adapter, not `collection_lookup` |
| `advisor_submit_recommendations` | `ModelSubmission`, 0..10 selections -> validated `AdvisorResult` | display-tool pattern, with action descriptors server-derived |
| `advisor_apply_recommendations` | `ApplyRequest`, authenticated owner -> `ActionSuccess` or typed error | reuse T-28 atomic action RPCs with `source = 'ai'` |
| `advisor_undo_last_apply` | `UndoRequest`, authenticated owner -> `ActionSuccess` or typed error | reuse existing undo RPC; identifies the last `source = 'ai'` operation |

**[Enforcement]** Cap one turn at the existing ten tool-loop iterations, 15 seconds
per tool, 30 seconds total; enforce the total with cancellation rather than only
checking at the start of an iteration. All public-fact requests count toward that
budget and respect upstream throttling. Bounds are initial safety limits, not an
8-second latency claim. Unknown/unauthorized tool names are errors before execution.
Do not expose editing or write-on-read helpers in this capability set.

**[Proposal]** Preload essential facts before generation rather than hoping the
model asks for them. Retrieval returns at most 100 candidate keys with completeness
and source coverage notices. At least one exact source must resolve every card.
Optional EDHREC failure allows a smaller rules/collection pool **with a notice**,
not a fabricated successful EDHREC empty list. "No matches" is only scoped to the
searched pool, not proof no suitable Magic card exists.

### 5.3 Structured model result and server decoration

The model returns native tool arguments, not fenced prose, `{{commander:...}}`
markers, regex-extracted lists or reconstructed XML calls (D-016).
`ModelSuggestion` selects server-issued candidate/commander keys and claim IDs.
It includes commander-specific rationale, one or more roles, mechanics, support
conditions, anti-synergy, optional cut/open-slot/not-assessed context, optional
package and honest unknowns.

**[Enforcement]** The model cannot set card names/IDs/text, ownership labels,
copy eligibility, prices, provenance timestamps or validation outcomes. Server
joins those from the bound context. Foreign keys, bad shapes, unsupported output,
duplicate suggestions or invented claims fail validation. Do not silently repair
a wrong name/printing or emit the surviving half of an invalid model submission.
All-or-nothing submission rejection is narrow and testable; source enrichment can
still produce a valid *partial* result with unknown availability/price.

**[Proposal]** Relevance explanation has two levels:

- Rules claims cite a supplied, reviewed assertion ID and exact face evidence.
  A quote matching text proves the quote, not every inference drawn from it.
- Interpretations (for example, "this deck may need more sacrifice outlets") are
  explicitly interpretations with evidence, conditions and unrated usefulness.
  An unsupported interaction is removed from the candidate explanation before
  generation, or the resulting submission is rejected; do not call it verified.

Start with the few reviewed assertion families needed for Prosper/Korvold, paired
identity and the face/legality negatives. Do not build T-19's entire mechanics graph.
Unknown/new mechanics remain unknown. Existing single-label classifiers may provide
labelled hints, never an authoritative assertion or a reason to discard other roles.
Popularity can retrieve candidates but is not the evaluation label or dominant
guarantee of fit. Do not demand full EDHREC ingestion as a prerequisite.

Do not badge the entire generated rationale as "verified": deterministic checks
prove supplied identifiers, constraints and referenced assertion membership, not
arbitrary prose entailment. Render the factual explanation from the reviewed claim
text; label the model's rationale as an interpretation. Unsupported interaction
wording is a failed evaluation case, not evidence simply because a claim ID exists.
Use the shadow review to assess these interpretations separately from hard facts.

Validation order: schema/key membership -> current identity and faces -> current
Commander legality -> valid commander/pair union -> main-list singleton/restrictions
including card-specific exceptions -> explicit preferences -> supported claims ->
cut/package membership -> fresh context -> T-28 and price decoration -> action
descriptor generation.

Unsupported deck-limit exceptions are unknown, not automatically unlimited.
Existing invalid/banned cards in the deck remain visible as facts; they do not
authorize the same card as a suggested add. Optional cut never targets another
deck, a generic quantity by copy ID, or a commander without a separate future rule.

A complete 100-card list may receive `cut: not_assessed`, visibly "cut still needed";
that is not a structurally complete swap. Do not invent a cut to satisfy a score.
Package members each undergo the same validation, and listing a package neither
adds it nor proves a combo works.

### 5.4 Apply, undo and operation semantics

**[Approved]** Each accepted suggestion becomes one atomic operation (or a
single batched operation for multiple suggestions) with `source = 'ai'` (D-009).
The supported AI actions are the same owner-visible actions as manual assembly:
Sleeve, Move from [deck], Proxy, Remove, and Move to Maybeboard (when membership
representation is resolved). Each operation carries an `operationId`,
`observationToken` and expected-state preconditions as required by T-28 §7.

**[Enforcement]** An AI apply never switches a printing or finish, never deletes
an owned copy, never takes a copy from another deck without an explicit Move from,
and never leaves a cross-deck move half done. A Move from shows the donor deck and
its readiness impact before the owner confirms; the advisor applies it only when
the owner explicitly accepts that impact. Proxy creation records the requested
printing of the deck slot per D-038.

**[Approved]** Undo reverts the last `source = 'ai'` operation for that deck/user.
Undo is itself a manual action recorded with `source = 'manual'` (undo is a user
choice). If the last AI operation is no longer reversible because the state has
changed, return `stale_observation` and show the current state. Undo of a batched
apply reverts the whole batch atomically.

**[Enforcement]** AI apply/undo reuse the same RPCs, locks, idempotency and
receipt rules as manual actions (T-28 §7.4). No separate "AI transaction" path
that bypasses expected-state checks. No client-side `userId` or forged action
descriptor authorises a write.

### 5.5 Outcomes and terminal semantics

| Outcome | Meaning |
|---|---|
| `complete` | Nonempty validated recommendations, all required facts available; `issues` empty |
| `partial` | Nonempty validated card/legality recommendations, with explicitly unknown secondary facts or source coverage; nonempty issues/notices explain limitations |
| `no_matches` | Explicit valid submission with zero suggestions and reason, after a successful bounded search; never a fallback for a failed source |
| `needs_context` | Missing commander, uncertain pair, unspecified material preference or unsupported format; precise missing inputs, no suggestions |
| `error` | Explicit typed failure, no successful result or replacement list |

For budget/owned-only constraints, unavailable price/ownership is essential and
blocks the affected candidate rather than merely decorating a partial result.
For ordinary advice, absent price and unavailable ownership may remain explicit
unknowns.
In the proposed `owned_only` mode, an existing original or proxy is ownership,
including a held copy; "owned" is not "free". Explain the actual copy type and
availability, and ask if the user instead means free originals only. Never silently
exclude proxies or treat a future Proxy action as an already owned copy.

Before SSE: 400 invalid request; 401 unauthenticated; 404 absent/not-owned;
409 changed context; 422 unsupported/insufficient context; 429 throttled;
502 malformed provider output; 503 dependency unavailable; 504 timeout.
After opening SSE, use the same error codes in an `advisor_result` error, then
one `advisor_done` with `outcome: error`. HTTP 200 streaming is not outcome success.
Runtime network/provider details go to existing scoped logging with request ID,
not credentials, private transcript dumps or raw provider errors in owner text.

Emit `advisor_status` while working and exactly one terminal `advisor_result`.
Cards appear only after validation, not from streaming prose. `advisor_done` must
match that result; disconnect/missing done means incomplete, never success.
Deduplicate on request ID/event type; discard an old request's late result after
navigation or a new turn. No implicit retry after timeout/disconnect: explicit
retry performs new reads. Duplicate read requests cannot cause deck edits.

## 6. Safeguard slices

### S1. Sidebar apply/allowlist

**[Enforcement; release]** Establish an advisor capability on the server,
enforce the advisor-only allowlist in definition selection **and** dispatch.
Browser removes add/remove POST handling for advisor messages and explicitly
reports unexpected mutation events as unsupported. Ignore cached legacy events
for execution, not for diagnostics; never replay history as actions. A prompt
alone is insufficient. Deploy server block first, then the versioned client;
do not expose new suggestions until both are compatible.
Keep new-deck/workbench flows outside this targeted capability change.

Acceptance: instrument all deck/copy mutation boundaries with mocks; an "add Sol
Ring" advisor turn, a forged native mutation call and a legacy SSE event each
produce **only** the validated, owner-accepted AI operations. Manual add remains
available outside advisor. Every AI operation is undoable and carries `source = 'ai'`.
An old client/new server and new client/old server fail explicitly rather than apply.

### S2. Empty Upgrade refresh

**[Approved, D-036a]** If Upgrade refresh fails, keep existing Upgrade suggestions
visible, dated as old, and explain "New upgrade analysis is not available yet".
Do not clear the existing list.

**[Enforcement]** After auth and owned-deck verification, current refresh returns
HTTP 503 with `refresh_unavailable`, `retryable: false`. No delete/upsert, generated
time update, apply or success toast. UI renders the explicit reason and retains
cached suggestions. A hard refresh reads unchanged stored content.
This slice needs no generator, RPC, migration or destructive recovery.

If regeneration is later built, compute and validate a complete replacement off
to the side, then one owner-scoped compare-and-swap transaction for all storage
rows; any failure rolls back wholly and preserves old content. A legitimate empty
analysis must be distinguished from failure and explicitly reviewed before it
replaces history. This is a later storage contract, not permission to implement it.
Previously erased content is not recoverable from this safeguard alone; do not
invent or restore recommendations from model memory.

### S3. Dropped or malformed tool calls

**[Enforcement]** Native tool calls only, both streaming and non-streaming.
Detect DSML masquerading as calls and return `unsupported_response`; do not parse
its parameters into executable operations or silently strip it into success.
Accumulate native calls by stable provider index/ID, append each arguments fragment
once, require complete valid JSON and a known schema/name at completion.
Duplicate ID/conflicting fragments, malformed/truncated JSON, content filter,
empty provider choice, unknown tool and missing terminal event are explicit errors.
Ordinary prose mentioning a tool is not itself a call.

Propagate typed terminal failure through adapter -> tool loop -> route -> sidebar.
Remove the advisor's no-tools fallback and empty-success returns; independent
non-advisor behavior is not refactored by this slice. If shared adapter behavior
changes, test both call modes and existing consumers before release.
No silent provider switch or retry that can turn failure into an invented answer.
One failed required fact tool prevents a verified success; optional failures can
produce a declared partial result only through the validated final tool.

Mock acceptance includes split DSML markers, first chunk carrying both call header
and arguments, interleaved two-call deltas, malformed JSON, unknown tool, provider
refusal, timeout and socket close. Each intended native call executes once at most;
unsupported calls execute zero times. End users see failure and can deliberately retry.

## 7. Concurrency, persistence and schema limits

**[Enforcement]** Reads create no allocation or inventory rows. No read transaction
claims to reserve a copy. Deck context revision is a deterministic hash of ordered
slot identities/quantities/relations/commander selection plus effective strategy;
not `last_synced_at`, which is not a complete manual-edit revision. Re-read and
compare before emission. Failure/change -> explicit stale result, not partial success.
Availability coherence/snapshot semantics must come from reviewed T-28; sequential
queries with timestamps are not automatically an atomic inventory snapshot.
Any required new read RPC waits for separate schema approval.

**[Proposal]** M2 suggestions are ephemeral structured response data, but applied
operations are durable and undoable. Keep existing conversation logging separate:
local source inserts user and assistant messages independently and may update
session metadata. [Confirmed: src/app/api/oracle/chat/route.ts]
No structured-proposal persistence is introduced. If retained transcript writes
fail, report a conversation-save warning separately, do not claim the reply was
saved; the user's message may persist without an assistant reply.
These existing writes are not an atomic turn and must not contain deck mutations.
Do not extract executable suggestions from stored prose on reload.

**[Enforcement]** No migrations required for S1-S3 or transient public-fact DTOs.
No new table is touched by this proposal. Existing `placement_source` (D-009) is
reused for AI changes. Relevant existing table constraints, read indexes and gaps
are below; this is a source inventory, **not** live schema proof.
All user-owned tables require user scoping and owner-only RLS; public reference
tables permit public reads, not user writes. Reconfirm actual policies before reuse.

| Read surface | Keys/relationships/uniqueness observed in repository | Query/index requirement |
|---|---|---|
| `decks` | Integer PK `id`; `user_id`; commander/build/folder FKs. No per-user name uniqueness assumed | owned lookup `(id,user_id)`; existing PK sufficient for single-ID lookup |
| `deck_cards` | Integer PK `id`; FKs deck/copy/proxy-source-deck; `user_id`; printing ID is a Scryfall ID, no generated printing FK. Do not assume a database-enforced unique copy holder from the generated type | `(deck_id,user_id)`, holder lookup `copy_id`; T-28 must verify copy uniqueness enforcement |
| `user_cards` | Integer PK `id`; canonical `oracle_id`; unique `(oracle_id,user_id)` in later migration | canonical scoped lookup uses that unique index |
| `user_copies` | Integer PK `id`; FKs `card_id`, `proxy_for_card_id`, `location_id`; `printing_id` is Scryfall printing, no generated FK. Repeated identical physical copies are legitimate, no uniqueness by printing/finish | `(user_id,card_id)` and holder IDs; preserve original/proxy distinction |
| `user_locations` | Integer PK `id`; optional deck FK; partial unique deck-location index; storage-name/user and one-default/user indexes in later migrations | scoped location IDs, never infer location from a null |
| `ref_printings` / `ref_cards` | Printing PK `scryfall_id`, indexed nonunique canonical `oracle_id`; `ref_cards` keyed by name, no oracle/face FK | exact printing, canonical index and exact-name lookup; name alone is not proof |
| `ref_commanders` / `ref_commander_cards` | UUID commander PK, unique canonical key; child UUID PK and commander FK, unique commander/name and commander/position | exact reference ID/membership; never conflate commander-table UUID with oracle ID |
| `ref_commander_builds` / `ref_build_cards` | UUID PKs, commander/build FKs; unique commander/theme and build/card-name | build/commander index and build/synergy index; resolve each stored name |
| `deck_strategy` / `deck_upgrades` | Each PK `deck_id`, FK decks; `user_id`; strategy updated time, upgrades generated time | PK + owner checks. Refresh safeguard does not write upgrades |
| Existing `oracle_sessions` / `oracle_messages` | UUID session/message PKs; messages' session and context-deck FKs; user ownership; no request-id replay uniqueness assumed | existing user/time, session and context indexes; verify session ownership, logging is not proposal storage |
| `user_preferences` | Not in generated schema; source uses `user_id` and untyped access | Do not certify PK/FK/uniqueness/RLS or provenance. Verify separately; until then return unknown and use explicit turn/deck inputs |

Evidence: [Confirmed: src/types/supabase.ts;
supabase/reconciliation/pre-ledger/outer-migrations/20260702112545_001_initial_schema_tier1_and_2.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260702112557_001_initial_schema_tier3_and_4.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260702112616_001_initial_schema_tier5a.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260702112634_001_initial_schema_tier5b.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260702222454_003_mtg_cards_reference.sql;
supabase/reconciliation/pre-ledger/outer-migrations/20260726160000_scryfall_printings.sql;
supabase/migrations/20260730044951_rename_tables_prefix_convention.sql;
supabase/migrations/20260730205437_create_deck_leaderships.sql;
supabase/migrations/20260730214119_rename_leadership_to_commanders.sql;
supabase/migrations/20260803150000_create_oracle_messages.sql;
supabase/migrations/20260806000000_create_commander_builds.sql;
supabase/migrations/20260812220000_fix_locations_unique_constraint.sql;
supabase/migrations/20260907061042_fix_user_cards_unique_constraint.sql;
supabase/migrations/20260912114410_collection_foundation_default_storage_location.sql].

**[Later schema gates]** Persistent canonical face/rules cache with provenance and
expiry; confirmed-vs-generated preference provenance; reviewed Maybeboard relation;
availability snapshot/revision support if current reads cannot provide it; durable
operation receipts and idempotency per T-28 G-M9; real Card Kingdom price mapping/source.
Each needs a separate bounded contract/migration approval. No destructive rebuild,
background seed or migration draft is authorized here.

Rollback: disable the new advisor capability and preserve the existing deck data.
Never roll back to unlogged auto-apply or destructive Upgrade refresh. Drop only
ephemeral responses/cache on version mismatch; do not delete user data. No data
backfill or irreversible conversion is part of this slice.

## 8. Offline examples and evaluation gates

### 8.1 Executable reference examples

The companion file uses real public card *names* from frozen T-19 examples and
explicit `fixture-*` identifier aliases, synthetic owners/copies and fixed times.
They are not claimed Scryfall UUIDs, current legality observations or the owner's
decks. A production resolver must reject these aliases. The fixture directory
does not contain an authenticated current card export; inventing real-looking
UUIDs would undermine D-003. Real database identity is a separate exit gate.
No private data or public API calls are needed to run:

```sh
node docs/oracle/contracts/advisor-tools.examples.ts
```

Reference checks validate boundary decisions, not semantic recommendation quality
or production handlers. Strict standalone type-check, when TypeScript is available
and the T-28 shared types file is present at the same relative path:

```sh
tsc --noEmit --strict --target ES2022 --module nodenext --moduleResolution nodenext \
  --allowImportingTsExtensions --skipLibCheck \
  docs/oracle/contracts/advisor-tools.types.ts \
  docs/oracle/contracts/advisor-tools.examples.ts
```

| Case | Expected behaviour |
|---|---|
| Prosper / Light Up the Stage | Evidence supports play-from-exile, including land play, as conditional Treasure production; no promise two Treasures happen immediately |
| Korvold / Deadly Dispute | Sacrifice artifact/creature as cost can trigger Korvold; separate outlet and fodder roles |
| Korvold / Blood Artist | Creature deaths only; ordinary noncreature Treasure sacrifice is not a death trigger |
| Wilson + Candlekeep Sage / Mystic Remora | Legal colour union only after pair permission validated; Wilson alone rejects blue |
| Shatterskull Smashing | Two faces, removal and land-choice roles, one identity and deck slot; incomplete faces unknown |
| Dockside / missing legality | Frozen banned fixture rejected; a missing/stale/currently unverified legality result also rejected, never assumed legal |
| Stale ownership / failed lookup | No five-label grouping, no "Unowned" substitution; explicit partial or essential-input failure |
| Existing free proxy | Preserve `proxy_available`, actual copy, printing and finish; zero proxy creation |
| Alternate original / occupied original | Preserve T-28's alternative/Unavailable reason and source; no auto-move or alternative printing selection |
| Unsupported response | No regex rescue, no recommendation success; typed error and zero mutations |
| Direct apply / undo | Accepted suggestion produces a server-derived action descriptor with `source = 'ai'`; undo reverts it as one operation |
| Scryfall estimate price | Price quote provider is `scryfall`, `indicative: true`, clearly labelled; missing price is unknown, not $0 |
| Unset preferences / sparse evidence | No combo, bracket or budget default; fewer explained candidates or `needs_context`, never padded facts |

### 8.2 Staged evaluation, not a benchmark claim

**Stage 0: pure architecture checks now.** Run only the companion assertions and
standalone types if offline tooling is available. This task runs no app suite,
provider benchmark, authenticated request, server or database query.

**Stage 1: implementation verification after approval.** Extend existing isolated
identity-resolver tests and add scoped mocks for advisor tools/stream/client and
Upgrade refresh. Cover unauthorized parent/child/session, failed metadata vs empty,
invalid quantities/relation, banned/unknown rules, wrong printing/finish, concurrent
deck edit/copy transfer, stale stream, AI apply/undo, no upgrade erasure, native tool
fragments and complete error propagation. Repository suites which require local
environment or mutate services are not a shortcut. No weakened app checks.

**Stage 2: usefulness in shadow evaluation.** Freeze a versioned small gold subset
from T-19 sections 6-8 before expanding: Prosper, Korvold, Wilson/background,
Tymna/Thrasios, Shatterskull and the banned/conditional negatives above.
Then cover its full 16-commander matrix: Muldrotha, Edgar, Urza, Krenko, Teysa,
Atraxa, Gitrog, Sythis, Kinnan, Yuriko, Lathril and the sparse/new-commander case
in addition to those first cases. Re-verify the research's new-set release/legality
at evaluation time; the Vraska entry is not authority for a currently legal card.
T-19's Urza/Ouphe case also needs precise grading: Ouphe stops artifacts' activated
abilities, not Urza's own creature ability to tap artifacts for mana.

Retain T-19's eventual 400 face items, 16 x roughly 30 relevance candidates and
150 interaction claims as **optional evaluation expansion**, not M2 infrastructure.
Split by commander (8 development/8 held-out before tuning), freeze date/text
hashes/label author and inspect agreement on 20%. Gold judgments come from rules
and owner review, never EDHREC inclusion or unreviewed model labels.
Test real exceptions, not just IDs having UUID shape.

Compare current thin-input approach, deterministic+inclusion, synergy ordering,
and verified-context pipeline under the same candidate budget. Change one factor
at a time: verified facts, restricted multi-role assertions, commander context,
then retrieval, then model if warranted. No paid experiments or vendor selection
are authorized by this contract. Jev stays an optional later classifier evaluation
with T-19's data/gold-set/vendor/spend gates; it is not a production dependency.

| Gate/metric from T-19 | Target and approval status |
|---|---|
| Identity, pair-aware colour/legality, accurate availability | 100% of shown validated suggestions; zero fabricated facts, wrong printings or error-to-Unowned conversions; hard gate |
| Preferences and honest unknowns | Zero violations of explicit preferences; 100% disclosure of missing inputs; hard gate |
| Silent tool drops | Zero; explicit failures observable. Proposed operational stream/tool failure rate <=1%, not yet measured |
| Interaction precision / conditional errors | >=95% / <=2%; **owner calibration pending**, not permission to knowingly show unsupported rules claims |
| Relevance / specificity | nDCG@10 >= baseline +0.10; precision@10 >=0.70; >=50% of top 20 not generic colour staples; **owner calibration pending** |
| Role/package diversity | Each flagged missing role covered when supported; package <=40% unless selected; **owner calibration pending**, not forced padding |
| Adds/cuts | Structural correctness 100% when a pair/open slot is claimed; owner acceptance >=60% in shadow review **pending**. A `not_assessed` cut counts as incomplete, not a pass |
| Tag metrics if expanded | T-19 micro-F1 >=0.95 deterministic / >=0.85 semantic, per-tag filter precision >=0.90; proposed research targets, not evidence delivered here |
| Unrequested combos | Label/separate versus ask-first policy **D-036b** |
| Latency/cost | Proposed p95 <=8 seconds and track cost per accepted suggestion; **owner calibration/runtime budget pending**, no measured result |

**Stage 3: existing three-real-deck exit gate.** In a separately approved safe
environment, owner selects three real decks. Every shown suggestion resolves
through the real repository database to canonical identity and any displayed
printing; every availability label matches a complete contemporaneous T-28 result,
including proxy/finish/location details. Every applied suggestion is undoable and
carries `source = 'ai'`. A public-only card not in the database does not pass by
silent insert: reference-data ingestion, if needed, is a separate approved task.
Include one pair if the owner's decks permit; keep synthetic pair coverage otherwise.
Record all suggestions, applications and failures, not only successful rows.
Owner reviews usefulness separately. Passing fixtures is not this gate and cannot
advance M2 or resolve O-006.

## 9. Owner gates and bounded role handoff

No decisions are enacted by this file.

| Gate | Recommendation / what the owner sees / trade-off |
|---|---|---|
| G1: apply scope | Recommend direct apply for add/swap/remove and Move from [deck] after showing impact; every change is undoable. Alternative: keep read-only until M3. D-034 already approved direct apply; read-only mode is no longer the default. |
| G2: Undo granularity | Recommend one undo per accepted suggestion (or per batched apply). Alternative: undo each atomic sub-step separately. One-per-suggestion matches what the owner sees; sub-step undo is more granular but harder to explain. |
| G3: Upgrade refresh | Keep old suggestions and explain refresh unavailable (D-036a). No alternative offered; this is locked. |
| G4: unset tastes | Recommend ask first before including an infinite-combo package (D-036b); allow ordinary suggestions with explicit unknowns. Alternative: show known combo packages separately labelled. Neither invents a combo preference; custom-rule interpretation needing judgment asks the owner. |
| G5: weak evidence | Recommend fewer explained suggestions over a padded list (D-036c). For example, a new commander may get three grounded ideas rather than ten generic staples; quantity/relevance threshold calibration remains with owner. |
| G6: price source | Scryfall estimate prices, clearly labelled (D-035). No alternative offered; this is locked. |

### Final T-28 integration checklist (mandatory before acceptance)

- Obtain the reviewed successor from the Orchestrator, not another changing worktree.
  Pin its version and reconcile/import its read types rather than retain competing types.
- Agree candidate-versus-slot semantics, including candidate without requested printing,
  all five labels, all usable options and already-Sleeved/Maybeboard/generic exceptions.
- Prove exact oracle identity, proxy represented identity, printing and independent
  finish; no fuzzy identity may justify availability or any future physical action.
- Map failed/partial/stale lookups and invalid quantities to explicit non-success;
  test a failed row cannot become Unowned, an executable option or Playable.
- Verify snapshot consistency, validity and deck revision mismatch; re-use T-28
  policy instead of advisor-defined eligibility or expiration.
- Preserve recorded vs actual holder locations, originals/proxies, excluded-copy
  transition gates, and no inferred storage. No global retired-folder convention.
- Resolve D-005/D-018 relation mapping before list counts/cuts use it. Do not adopt
  the frozen draft's first-category rule merely because it is convenient.
- Confirm read-only summaries do not carry unconditional Proxy/action descriptors.
  D-026 creating and sleeving a proxy belongs elsewhere; free proxy reuse is distinct.
- Exercise the Sol Ring journey against consumer grouping after each change, including
  both donor and destination invalidations. For advisor cached facts, any affected
  deck/collection change invalidates that snapshot; old advice does not trigger moves.
- Keep readiness/shortage calculations out of advisor. Do not infer original shortage
  from proxy count or candidate availability; all-deck scope remains a T-28 owner gate.
- Confirm the AI apply/undo tool set reuses T-28 action RPCs, expected-state checks,
  operation receipts and `source = 'ai'` on every placement write.

### T-28 changes this contract expects (do not edit T-28; list in handoff report)

The following deltas were observed while reconciling the advisor boundary with the
T-28 worktree. They are recorded here so the Orchestrator can route them to the T-28
owner if not already accepted:

1. **AdvisorAvailability type shape:** T-28 currently exposes `AdvisorAvailabilityFacts`
   with a nested `availability` union. The advisor contract needs to correlate that
   with a per-candidate key and requested printing. T-28 should either accept a
   batch request returning `(AdvisorAvailabilityRequest, AdvisorAvailability)[]`,
   or expose a single-key function that the advisor batch wrapper can call. The
   return must include `oracleId`, `requestedPrintingId`, `availability` label,
   `originalsOwned`, `proxiesOwned`, `copies[]`, `excludedCopyCount` and observation.

2. **Operation receipt extension for AI source:** T-28 `OperationReceipt` carries
   `action`, `affected`, slots, copies and readiness. To support `source = 'ai'`
   provenance and advisor undo, the receipt should explicitly surface the
   `placementSource` of each affected slot, or the action request should record it
   so undo can identify the last AI operation per deck/user.

3. **Apply/undo action names:** The advisor needs `advisor_apply` and
   `advisor_undo_last_ai` semantics. T-28 action names are manual names (`sleeve`,
   `move_from`, etc.). The receipt should store the originating request kind or a
   tagged `source` so the advisor undo tool can filter to AI-initiated operations.

4. **Price field in AdvisorAvailabilityFacts:** D-035 wants a Scryfall estimate per
   candidate copy/printing. T-28 currently does not include price. The advisor
   contract adds its own `PriceQuote` derived from `ref_printings`; T-28 may later
   choose to own price freshness, but for M2 the advisor decorates availability
   with a separate price fact.

### Delivery order

1. **UX/owner:** T-16 shows suggestion cards, apply/undo affordance, conditional
    rationale, unknown/stale facts, proxy/alternative/source details, Scryfall
    estimate price and explicit failures. Confirm G1-G6; do not design M3 in this handoff.
2. **Backend:** S1-S3 independently bounded safeguards after relevant approval;
    then scoped context/facts, final T-28 read adapter, validated submit tool and
    apply/undo tools. Reuse listed surfaces, add runtime schemas and exact resolvers,
    retain typed errors. No new service, deep tagging platform, DB write endpoint
    or background generator.
3. **Frontend:** Versioned advisor events, validated cards only, no legacy mutation
    handling, scoped pending/error states, stale request suppression, retained
    Upgrade content and explicit apply/undo states. Do not parse prose to build cards
    or inherit old Apply controls.
4. **Acceptance:** final T-28 review, reference/isolated mock checks, owner-calibrated
    usefulness review and the approved three-real-deck exit test. Safe runtime setup,
    implementation, schema work, merging and release remain separately authorized.

Architecture can finish now. **Final cross-contract acceptance, app delivery and
the M2 exit gate cannot be marked complete by this document.**
