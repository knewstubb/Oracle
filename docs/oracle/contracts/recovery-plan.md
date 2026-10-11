# Oracle Recovery Plan

> Role: Architect — read-only, no migrations or database changes.  
> Purpose: state what must be backed up for the current setup (Oracle app runs locally; data lives in the hosted Supabase project), what the hosted Supabase project already provides, what today's exports miss, and a safe restore test that uses no real data.  
> Status: plan only; implementation of any backup/restore tooling is a separate owner-approved task.

---

## For Brad, in plain words

Oracle knows a lot more than the screens show. If something went wrong today, your cards, decks and box locations could only be rebuilt by starting from scratch and re-importing your original collection and deck files. The app does store the detailed relationships (which physical copy is in which deck slot, which box each spare copy lives in, and the history snapshots), but none of that is exported yet.

**Because you run Oracle on your own computer, here is the key point:** the app itself runs locally, but your card data lives in the hosted Supabase database on the internet. Vercel is not involved right now. So the backup plan is not about backing up your laptop — it is about protecting that online database copy.

---

## 0. Where Oracle's data actually lives today

| Piece | Where it lives | What protects it today |
|---|---|---|
| The Oracle app (Next.js) | Your computer | Git repository |
| Your card collection, decks, box locations, history | Hosted Supabase Postgres | Nothing automatic — Supabase Free has no managed backups |
| The keys that connect the app to the database (`.env.local`) | Your computer only | Whatever backup you make of that file |
| Original collection/deck source files (Archidekt, Moxfield, CSV) | Wherever you keep them | Your own file backup |
| Vercel deployment | Not used right now | N/A |

**How we know this:** the app reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` and connects to the hosted project [Confirmed: src/lib/supabase.ts; src/middleware.ts]. There is no `supabase/config.toml`, no `supabase start` script, and no local Postgres setup in this repo [Confirmed: glob for `supabase/config.toml`; package.json scripts].

**What this means:** if your laptop dies, your data is safe in Supabase as long as the Supabase project survives. If the Supabase project is deleted, corrupted, or overwritten, your data is gone unless you have a separate backup of it.

---

## 1. What a full Oracle backup must cover

The tables below are grouped by how hard the information is to recreate. "Restorable today" means from the hosted Supabase database alone, not from any user-facing export.

### 1.1 Your collection — the physical cards

| What it means | Stored in database today? | In the CSV export? | Restorable today? |
|---|---|---|---|
| Each owned copy (one row per physical card or proxy) | Yes — `user_copies` [Confirmed: src/types/supabase.ts] | Partially | Only if the database survives |
| Card identity (name, oracle_id) | Yes — `user_cards` | Name + Oracle ID only | Partial |
| Exact printing (set, collector number, finish) | Yes — `user_copies.printing_id`, `finish` | Yes | Partial |
| Condition | Yes — `user_copies.condition` | Yes | Partial |
| Proxy flag | Yes — `user_copies.is_proxy` | Yes | Partial |
| Purchase price, date added | Yes — `user_copies.purchase_price`, `created_at` | Price + date only | Partial |
| Storage location (which box/binder) | Yes — `user_copies.location_id` | **No** | **No** |
| Missing flag | Yes — `user_copies.missing` | **No** | **No** |
| Source/provenance (how the copy got in) | Yes — `user_copies.source_tag` | **No** | **No** |
| Language, acquired date, USD price | Yes — `user_copies.language`, `acquired_at`, `purchase_price_usd` | **No** | **No** |
| Proxy target (if proxy stands in for a specific card) | Yes — `user_copies.proxy_for_card_id` | **No** | **No** |
| Stable copy identity (the internal ID that links copies to decks) | Yes — `user_copies.id` | **No** | **No** |

**Verdict for collection:** the database has everything, but the CSV export is not a complete backup. Re-importing the CSV would create new copy rows with new IDs, so every deck assignment would be broken until manually fixed.

### 1.2 Your storage locations

| What it means | Stored in database today? | In any export? | Restorable today? |
|---|---|---|---|
| Boxes, binders, "Unsorted" | Yes — `user_locations` [Confirmed: src/types/supabase.ts] | **No export exists** | **No** |
| Which location is the default | Yes — `user_locations.is_default` | **No** | **No** |
| Colour, sort order, description | Yes — `user_locations.color`, `sort_order`, `description` | **No** | **No** |

**Verdict for locations:** fully stored, not exported at all. A rebuild from source files would lose every custom box/binder name and every card's box assignment.

### 1.3 Your decks and the cards in them

| What it means | Stored in database today? | In any export? | Restorable today? |
|---|---|---|---|
| Deck name, commander, folder, format | Yes — `decks`, `deck_folders` [Confirmed: src/types/supabase.ts] | Text decklist only | Partial |
| Deck list (which cards, how many, categories) | Yes — `deck_cards` | Text decklist only | Partial |
| Commander / maybeboard / sideboard grouping | Yes — `deck_cards.categories`, `is_commander` | Text decklist only | Partial |
| **Which physical copy sits in each slot** | Yes — `deck_cards.copy_id` | **No** | **No** |
| Whether a slot is original or proxy | Yes — `deck_cards.ownership_status` | **No** | **No** |
| How a slot was filled (manual, AI, import) | Yes — `deck_cards.placement_source` [Confirmed: supabase/migrations/20260925220000_placement_source.sql] | **No** | **No** |
| Deck priority, strategy, notes, health, upgrades | Yes — `deck_priority`, `deck_strategy`, `deck_notes`, `deck_health`, `deck_upgrades` | **No** | **No** |

**Verdict for decks:** deck lists can be rebuilt from the text export or re-imported, but the exact physical copy in each slot and all deck metadata would be lost in a rebuild.

### 1.4 History and reconciliation state

| What it means | Stored in database today? | In any export? | Restorable today? |
|---|---|---|---|
| Named version snapshots of a deck | Yes — `deck_versions` [Confirmed: supabase/migrations/20260812000000_create_deck_versions.sql] | **No** | **No** |
| Diffs between versions | Yes — `deck_versions.diff_from_previous` | **No** | **No** |
| Import sleeve claims (unresolved import choices) | Yes — `import_sleeve_claims` [Confirmed: src/types/supabase.ts] | **No** | **No** |
| Oracle chat sessions and messages | Yes — `oracle_sessions`, `oracle_messages` | **No** | **No** |
| Brew / debrief sessions and actions | Yes — `brew_sessions`, `debrief_sessions`, `debrief_actions` | **No** | **No** |
| Sync / import runs | Yes — `sync_runs` | **No** | **No** |

**Verdict for history:** fully stored, not exported. This is the data that would be hardest to recreate by hand.

### 1.5 Reference and generated data

| What it means | Stored in database today? | Restorable today? | Notes |
|---|---|---|---|
| Scryfall printings and card definitions | Yes — `ref_printings`, `ref_cards` | Yes | Can be re-fetched from Scryfall if lost |
| Commander builds / EDHREC recommendations | Yes — `ref_commander_builds`, `ref_edhrec_recommendations` | Yes | Can be re-synced from EDHREC |
| AI-generated deck health, upgrades, analysis | Yes — `deck_health`, `deck_upgrades`, etc. | Yes | Can be regenerated by running the AI features again |

**Verdict:** not precious for backup purposes; it is derivative.

---

## 2. What the hosted Supabase project already provides

Because the app runs on your computer but the database is the hosted Supabase project, the backup story is about that hosted project, not your laptop.

- **Supabase Free plan.** The project is on the Supabase Free tier. Free projects do **not** include managed daily backups or point-in-time recovery (PITR) [Confirmed: docs/audits/collection-migration-readiness-2026-09-03.md, §6 and §Accepted recovery risk].
- **Manual export is possible.** Supabase Free projects can be exported manually using the Supabase CLI (`supabase db dump` or `supabase dump`), but no automated schedule or documented runbook currently exists in the repo.
- **No repo-managed backup config.** There is no `supabase/config.toml`, GitHub Actions backup job, or documented backup schedule in `supabase/` [Confirmed: glob for `supabase/config.toml`].
- **The `.env.local` file is the key to your data.** It lives only on your computer. If you lose it, you can create a new one from the Supabase dashboard, but you should treat it as sensitive and back it up.
- **Hosted database is not a backup.** If the project were deleted, corrupted, or if a bad import overwrote data, the live database would not save you by itself.

**Verdict:** the hosted database stores everything, but it does not provide a recoverable backup service on the Free plan. Your laptop holds the connection keys; the Supabase project holds the data.

> **Side note: what a local database would change.** If Oracle ever switched to a local Supabase/Postgres database on your laptop, the data would live on your computer's disk. Then your computer backup would become the backup, and losing the laptop without a backup would mean losing the data. The rest of this plan assumes the current setup: local app, hosted database.

---

## 3. What today's exports omit

### 3.1 Collection CSV export

`GET /api/collection/export` produces a CSV with: Name, Quantity, Edition Code, Edition Name, Collector Number, Scryfall ID, Oracle ID, Finish, Condition, Proxy, Purchase Price, Date Added [Confirmed: src/app/api/collection/export/route.ts].

It omits:
- The internal copy ID (`user_copies.id`).
- Storage location / box assignment.
- Missing flag, language, acquired date, USD price, source provenance, proxy target.
- Any link to decks or deck slots.

Because it omits the copy ID, a CSV cannot be used to rebuild the exact links between copies and deck slots. Re-importing it would create brand-new copies.

### 3.2 Deck text export

The deck export produces an MTGA-style text list: `1 Card Name (SET)` grouped into Commander / Deck / Sideboard / Maybeboard [Confirmed: src/lib/deck-export.ts].

It omits:
- Copy assignments.
- Finish, condition, proxy status.
- Categories beyond the primary one used for grouping.
- Deck metadata (priority, strategy, notes, health, upgrades).
- Version history.

It is useful for sharing a list or re-importing a deck skeleton, but it is not a restore artifact.

---

## 4. Restore scenarios: what works today and what does not

### 4.1 Scenario A — total loss of the Supabase project

| What would survive | What would be lost |
|---|---|
| Your original Archidekt / Moxfield / CSV collection and deck source files, if you still have them | Every Oracle-only edit: box locations, missing flags, purchase details, which copy is in which deck, version snapshots, deck notes/strategy/health, chat history, unresolved import claims |
| Card identities can be re-resolved from Scryfall | Custom storage locations would have to be recreated by hand |

**Recommended approach today:** keep the original source exports in a safe place and accept that Oracle would be rebuilt from scratch. This is the owner-approved posture for the MVP [Confirmed: docs/audits/collection-migration-readiness-2026-09-03.md, §Accepted recovery risk].

### 4.2 Scenario B — accidental collection overwrite

The collection import route now validates the entire file before swapping, so a bad CSV should not leave a partial collection [Confirmed: docs/roadmap-foundations-first.md, §Phase 2]. However:

- A successful replace still deletes old copy IDs.
- Deck slots that pointed to the old copies become unassigned.
- Storage locations, missing flags, and manual edits on old copies are lost.

**Recommended approach today:** before any replace, export the current CSV and treat it as a last-resort snapshot of card metadata only, not a full restore.

### 4.3 Scenario C — restoring a deck to an older version

The app already supports version snapshots and restore [Confirmed: src/app/api/decks/[id]/versions/[versionId]/restore/route.ts; src/app/api/decks/[id]/versions/route.ts]. This restores the *deck list*, not historical physical locations: it releases current copies to storage and creates unassigned slots matching the snapshot. You would still need to re-sleeve cards afterwards.

**Verdict:** version restore protects deck lists, not the full allocation state.

---

## 5. Minimum safe approach today

Until a full relational backup exists, the safest posture is:

1. **Keep `.env.local` safe.** It holds the keys that connect your local app to your hosted data. Store a copy in your password manager or secure notes.
2. **Keep source files as the real backup.** Retain the authoritative Archidekt collection export and each deck's source file (Archidekt, Moxfield, or CSV). Do not delete them.
3. **Export the collection CSV before any replace.** Treat it as metadata-only emergency reference, not a restore artifact.
4. **Do not rely on the live database as a backup.** Supabase Free does not provide managed backups or PITR.
5. **Document where the source files live.** If someone else ever had to rebuild Oracle, they should know which files are authoritative and how to re-import them.
6. **Rehearse the rebuild in an isolated project.** A staging project is not a backup, but it proves the rebuild steps work before you need them.

---

## 6. Owner decisions needed

| Decision | Why it matters | Options |
|---|---|---|
| **1. Accept the current rebuild-only posture, or fund/enable real backups of the hosted database?** | This is the biggest decision. It determines whether Oracle remains a disposable working copy or becomes a durable source of truth. | **A (recommended minimum):** Keep source files as backup and accept Oracle-only data loss. **B:** Upgrade to Supabase Pro for managed daily backups + PITR (~$25/mo at current plan levels). **C:** Add a scheduled manual Supabase CLI dump to a secure store. |
| **2. If backups are enabled, what exactly is backed up?** | A full database dump covers everything. A user-facing export would need to include copy IDs, locations, and assignments to be restore-capable. | **A:** Full database dump (simplest, covers all tables). **B:** Enhanced user-facing export that includes relational links (more work, but portable). |
| **3. How often should backups run?** | Your collection changes slowly; deck assignments and AI content change faster. | **A:** Daily (matches Supabase Pro default). **B:** Weekly + before/after bulk imports. **C:** On demand only. |
| **4. Where are `.env.local` and source files kept?** | You need both to reconnect the app or rebuild from scratch. They must be findable, secure, and immutable. | Decide now: password manager for `.env.local`; specific cloud folder or NAS for source files. |
| **5. Is version-history restore good enough for deck lists?** | Current version restore releases copies; it does not restore historical physical allocation. | **A:** Accept that deck-list restore means re-sleeving. **B:** Invest in a richer "restore" that also tries to re-attach the same physical copies where they still exist. |

> **Side note: local database option.** If Oracle ever switched to a local Supabase/Postgres database on your laptop, the data would live on your computer's disk and your computer backup would become the backup. That is not the current setup, so it is not the focus of this plan.

---

## 7. Proposed restore test — uses no real data

This test can be run against an empty/isolated Supabase project or a local Postgres instance. It proves whether a backup/restore process can reconstruct the relational state without touching your real collection.

### 7.1 Goal

Create a tiny synthetic Oracle world, back it up, wipe it, restore it, and verify that:
- Copies exist with the right printing, finish, condition, and proxy flag.
- Each copy is in the right storage location or deck slot.
- Deck lists match.
- Version snapshots and import claims survive.

### 7.2 Synthetic test data

Create one test user and the following:

1. **Storage locations:**
   - "Trade Binder" (default)
   - "Top-Loader Box"

2. **User cards:**
   - `Sol Ring` (oracle_id: `a1b2c3...`)
   - `Command Tower` (oracle_id: `d4e5f6...`)
   - `Forest` (oracle_id: `g7h8i9...`)

3. **User copies:**
   - Sol Ring, foil, near mint, in Trade Binder
   - Sol Ring, nonfoil, proxy, in Top-Loader Box
   - Command Tower, nonfoil, lightly played, in Trade Binder
   - Forest x5, nonfoil, near mint, in Trade Binder

4. **Deck:**
   - "Test Deck" — Commander: Sol Ring (foil), 98 other slots including Command Tower and 30 Forests (generic basics under D-032).
   - Assign the foil Sol Ring to the commander slot.
   - Assign the proxy Sol Ring to a regular slot.
   - Assign Command Tower to a slot.
   - Leave some slots unassigned.

5. **Version snapshot:**
   - Create a snapshot named "Before swaps".

6. **Import claim:**
   - Create one unresolved `import_sleeve_claims` row for a card the test user "wants to resolve later".

### 7.3 Backup method to test

Option A (database-level): `supabase db dump` or `pg_dump` of the isolated project.

Option B (user-facing full export, once built): export every table above as JSON/CSV, then re-import.

### 7.4 Restore verification checklist

After wiping and restoring:

- [ ] User cards and copies match the input counts.
- [ ] Copy IDs are stable (or remapped consistently so deck slots point to the right copies).
- [ ] Storage locations exist with the same names and default flag.
- [ ] Each copy is in the correct location or deck slot.
- [ ] Deck list matches the original, including commander/maybeboard categories.
- [ ] `deck_cards.copy_id` links are correct.
- [ ] `deck_cards.ownership_status` is correct (original vs proxy).
- [ ] Version snapshot "Before swaps" exists and its `cards_snapshot` matches.
- [ ] Import sleeve claim still exists unresolved.

### 7.5 Expected result today

- A full `pg_dump` would pass every check.
- The current user-facing exports would fail the copy-ID, location, assignment, history, and import-claim checks.

---

## 8. Summary table

| Kind of data | Restorable from database alone? | Restorable from today's exports? | Minimum safe action today |
|---|---|---|---|
| `.env.local` (connection keys) | N/A — lives on your computer | No | Store a copy in your password manager |
| Owned copies (metadata) | Yes | Partial (CSV) | Keep source files; export CSV before replace |
| Copy identity / stable IDs | Yes | No | Do not rely on CSV for restore |
| Storage locations | Yes | No | Record box names outside Oracle |
| Deck lists | Yes | Partial (text export) | Keep source deck files |
| Copy-to-deck-slot assignments | Yes | No | Rebuild by hand after any restore |
| Deck metadata (notes, strategy, health, upgrades) | Yes | No | Re-generate or re-enter |
| Version snapshots / diffs | Yes | No | Accept list-only restore |
| Import reconciliation claims | Yes | No | Finish imports before relying on state |
| Chat / brew / debrief history | Yes | No | Treat as ephemeral |
| Reference / generated data | Yes | Yes | Can be re-fetched/regenerated |

---

## 9. What would change the verdict

Any of the following would move Oracle from "rebuild only" to "restorable" with the current local-app / hosted-database setup:

1. **Supabase Pro + PITR** enables point-in-time recovery of the whole hosted database.
2. **Scheduled `pg_dump`** from the hosted project to durable storage gives a recoverable full-database snapshot.
3. **Enhanced user export** that includes copy IDs, location IDs, deck-card IDs, and assignment links, plus a matching importer that preserves those IDs.
4. **A documented, rehearsed restore runbook** that has been executed successfully in an isolated project.

> **Side note:** moving to a local database would shift the backup responsibility to your computer's backups. That is a separate decision, not the current setup.

Until one of those is in place, the owner-approved recovery model remains: **reset Oracle and rebuild from retained source files** [Confirmed: docs/audits/collection-migration-readiness-2026-09-03.md, §Accepted recovery risk].
