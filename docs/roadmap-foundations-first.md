# The Oracle — Foundations-First Roadmap (plain language)

> Written: 2026-09-14 by Ed (Software Educator), from an interview with the user
> Purpose: a simplified, honest picture of what's built, what's shaky, and what order to fix things in
> Goal stated by user: get to a *solid Archidekt replacement*, with the foundations right, before leaning on this day to day
> This is a snapshot, not a spec. The authoritative detail lives in `.kiro/specs/tech-debt-register.md`, `.kiro/specs/product-spec.md`, and `docs/audits/collection-migration-readiness-2026-09-03.md`.

---

## The one-sentence version

The app has a lot of real, working functionality, but it grew wide before its foundation was fully poured — especially around **getting your collection and decks in, and trusting the numbers once they're in**. That's the right place to focus next, and it's already partly underway.

---

## What's solid and working (keep relying on this)

These are shipped, used daily, and not flagged as at-risk:

- **Login / auth** — works, simple, no known issues.
- **Deck detail views, Cards Tab, Picklist** — the six-state card status system (Original/Proxy/Available/Alternate/Claimed/Unowned) is implemented and consistent across views.
- **Deck lifecycle** (Brewing → In Rotation → Graveyard) — works, has sensible guard rails (can't archive an incomplete deck without acknowledging it).
- **Basic lands handling, mana pips, set icons** — cosmetic-but-important stuff, all shipped.
- **Card category classification** — every card in the database has a functional role tagged (Ramp, Draw, Removal, etc.) for deck health checks.
- **UI design system** — consistent look across pages (spacing, colors, components).

## What's shipped but shakier than it looks

These work in the common case, but have a known gap that could bite you:

- **Pricing data** — partially stale, no auto-refresh loop. Cosmetic risk, not a data-loss risk.
- **Upgrade suggestions / deck health** — works, but depends on data (pricing, EDHREC sync) that isn't fully fresh.
- **AI Brew (chat-assisted deck building)** — fully functional, but it's a big, separate subsystem. Given your priorities, this should stay frozen while foundations get fixed — no new work here for now unless you say otherwise.

## What's recently fixed (the good news)

This is already underway and is exactly the right direction:

- **Atomic collection movements** — moving a card between storage and a deck slot, or deleting a deck, used to risk leaving a card in two places at once (or nowhere) if something crashed mid-action. That's now fixed with proper database transactions for every move, release, and deletion path, including the most recent fix: removing a single card from a deck now correctly returns it to storage in one atomic step instead of two separate risky steps.
- **Built-deck reconciliation** — importing a deck you've physically built now correctly pulls free copies from your collection and tells you what's missing, instead of silently guessing or leaving things inconsistent.
- **The old card scanner** was removed — it was unreliable (couldn't tell cards apart from a phone camera) and was creating a second, less-safe way to add cards to your collection.

## What's actively broken or missing — this is your "clunky" feeling, named specifically

1. **The one-time setup wizard's multi-deck picker overflows.** (Small, contained fix — not a systemic issue.)
   Correction from an earlier draft of this doc: a persistent, always-available "Import Deck" flow already exists on the main decks page (URL/paste/CSV/precon, one deck at a time, any time — including reimporting a deck you've re-scanned). The overflow bug only lives in the **onboarding wizard**, the one-time "here's your collection, now pick which decks to bring in too" screen — a narrow, fixed-size popup with a cramped scroll box, never designed to comfortably show many decks. Since real usage is "import once at the start, occasionally reimport a single deck later," this is a small first-impression fix, not a phase of work.

2. **Collection replace/re-sync safety — CORRECTED, already fixed.** (TD-026, now marked *resolved*.)
   This document previously said replacing your collection deletes the old data before checking the new data is good, and treated the fix as the top priority. That's now out of date: tracing the actual code on 2026-09-14 confirmed the safe validate-then-swap behavior was already built and hosted-verified as part of the collection-foundation work (see its delivery log). The old data is never touched until the entire new file has been fully checked, and the swap happens as one all-or-nothing database step. What's still genuinely missing is **progress visibility** — right now you only see "importing..." with no real progress bar, since the whole check-and-swap happens as a single request behind the scenes.

3. **No tested backup/restore.** (TD-028, accepted as a known risk for now.)
   The current plan if something breaks is "delete everything and re-import from your original files." That's an acceptable stance for a private app, but it means you must always keep your source export files as the real backup — Oracle itself is not one yet.

4. **Basic card-management functionality gaps.** You flagged this directly — this is the through-line of items like: no reliable database-level search/sort/filter at scale for your collection list (it currently sorts and pages in memory, which can be wrong at the edges as your collection grows), and no proper "manage my decks in bulk" screen.

5. **Security boundary is not ready for other people's data.** (TD-037, critical, open.) **Elevated priority — see below.**
   Nearly every table currently has no per-user lock (Row Level Security) at the database level. Right now that's contained because the app's server code enforces "only show me my own stuff" — but if a second person's login existed today, there is no independent database-level guarantee stopping cross-account access if a bug slipped through the app layer. With up to 10 people potentially sharing this app, this is real multi-tenancy, not a hypothetical — it needs to happen before the first non-you login, not "eventually."

6. **Quality gates are red.** (TD-031, open.) Tests, types, and lint are currently in a broken/ignored state, which means it's hard to tell "did my change break something" from "was it already broken." This slows down every other fix.

## Where things stand overall

There's an existing internal verdict on this exact question — "is Oracle safe to fully trust as my only collection record yet" — and the honest answer as of the last full review was **no, not yet**, for the same reasons above. Good news: that review also laid out the fix order, and you're already partway through step one of it.

---

## Proposed roadmap — in sensible order

This follows "fix the ground before adding another room" — foundations first, matching what you asked for.

### Phase 1 — Make writes safe (in progress)
*Goal: nothing you do in the app can silently corrupt or lose data.*
- Atomic movement of cards between storage/decks — **mostly done**.
- Atomic, safe deck-card removal — **just shipped and verified against your real data**.
- Remaining: make the *undo* action and a few other multi-step actions equally safe (TD-029).

### Phase 2 — Make collection replace/re-sync safe (the real "trust" fix)
*Goal: reimporting or re-syncing your collection can never leave you with a partial or lost collection.*
- Fix collection replace so it fully validates the entire new file *before* touching your existing data (TD-026), then swaps over in one all-or-nothing database action. This closes the critical data-loss gap directly.
- Small, contained fix to the onboarding wizard's deck-picker overflow (cosmetic, one-time screen — not a systemic redesign).
- Add the missing basics: proper searching/sorting/filtering that works correctly at your collection's real size, not just in the common case.
- **Deferred, not forgotten:** true incremental diffing (preserving storage location/notes/price across a reimport instead of wholesale replacement) is a real quality-of-life upgrade, but a bigger, separate effort — revisit only if wholesale-replace's loss of manual edits on reimport becomes an actual pain point. See "Understanding the collection-replace fix" below.

### Phase 3 — Lock down the database for shared use
*Goal: before anyone but you logs in, cross-account access is impossible at the database level, not just "the app code happens to filter correctly."*
- With up to 10 people potentially sharing this app, this is real multi-tenancy — moved up in priority accordingly.
- Enable and correctly scope Row Level Security (TD-037) so every table enforces "only your own data" independently of the app code.
- Add two-account test coverage proving isolation holds before the first real second user joins.

### Phase 4 — Prove it's safe to trust
*Goal: you can say "yes, this is my source of truth" with evidence, not hope.*
- Fix the test/type/lint baseline so future changes can be verified (TD-031).
- Rehearse a full "delete and rebuild from my export files" cycle in a safe copy of the app, and confirm the numbers match exactly.
- Decide and document your backup posture explicitly (even if the decision is "export files are my backup" — that's fine, but it should be a decision, not a gap).

### Frozen for now (by your own priority call)
- AI Brew / chat deck-building, Upgrade Tab, Monitor Mode — all functional, not touched until the phases above are solid.

---

## Decisions confirmed with the user (2026-09-14)

1. **Deck import is already persistent.** A "Decks" management area with import/reimport already exists on the main decks page and is used any time, not just at setup. Only the one-time onboarding wizard's multi-deck picker has the overflow bug — treated as a small polish fix (Phase 2), not a redesign.
2. **Collection-replace fix: validate-then-swap (Option A), not full incremental diffing (Option B), for now.** See "Understanding the collection-replace fix" below for what this means and what it trades away. True diffing is deferred, revisited only if the loss of manual per-copy edits (storage location, notes, purchase price) on reimport becomes an actual pain point in practice.
3. **Up to 10 people may share this app.** That's real multi-tenancy, not a "few friends, maybe." Row Level Security (TD-037) moved up to Phase 3, ahead of the trust/backup-rehearsal phase, and must land before the first non-owner login.

## Understanding the collection-replace fix (Option A vs. Option B)

The core problem today: replacing your collection deletes the old data *before* the new file has been fully checked. A bad row, a network drop, or closing the tab mid-import can leave you with neither your old nor your new collection — no undo.

**Option A — Validate then swap (the plan going forward).** Read and fully check the *entire* new file first — every card resolves, every quantity makes sense. Only once it all checks out, replace the old collection with the new one in one single all-or-nothing database action. This closes the data-loss risk completely. What it doesn't do: it's still a wholesale swap, so manual edits on the old records (storage box, notes, missing flags, purchase price) don't carry across automatically, and deck allocations get unlinked and re-resolved afterward (the existing Built-deck reconciliation work already handles pulling matching free copies back in).

**Option B — True incremental diffing (deferred).** Instead of swapping everything, compare card-by-card: matching cards are left completely untouched (so manual edits survive), only genuine additions/removals are applied. This is a meaningfully bigger build — it has to define "same card" carefully across printings/conditions and needs thorough testing, because a matching-logic bug is subtler and sneakier than a crash (it can quietly attach the wrong physical card instead of loudly failing).

Option A is the one that fixes the critical risk (data loss). Option B is a nice-to-have layered on top, later, only if needed.

---

## Provenance
- Interview conducted 2026-09-14 by Ed at user request, in response to "foundation feels clunky, want a sensible structure."
- Synthesized from: `.kiro/specs/tech-debt-register.md` (37 items), `.kiro/specs/product-spec.md`, `docs/audits/collection-migration-readiness-2026-09-03.md`, `.kiro/specs/collection-foundation/` delivery log, and direct inspection of `src/app/onboarding/page.tsx` (deck-picker overflow root cause).
