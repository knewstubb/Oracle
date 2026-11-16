# Report: category-briefs
Role: product
Status: DONE
Task as received: Write two briefs in docs/oracle/briefs/: (1) Category management: screen listing every category with card counts per deck and across decks, merge, rename, delete-empty, usable by Claude via the connector, preview and 7-day undo for many-card changes. (2) Suggested categories: on add to a deck, suggest from other decks and EDHREC tags, override by user/Claude, per-deck categories, no hard global default. Recommended order: category tool, then management, then suggestions. Report in docs/oracle/reports/.

## Summary for the owner
Two draft briefs are ready for your approval: one for tidying categories (merge, rename, delete-empty, with preview and undo) and one for suggesting categories when you add a card. Recommended order is the Claude category tool, then tidy-up, then suggestions. Each lists behaviour questions for you.

## Changed files
- docs/oracle/briefs/category-management.md — new draft brief
- docs/oracle/briefs/suggested-categories.md — new draft brief
- docs/oracle/reports/2026-11-16-product-category-briefs.md — this report

## Owner answers recorded (2026-11-16)
- Merge applies to every deck (one-deck option only if cheap) — category-management brief, section 9.
- Suggestions are offered, not auto-applied — suggested-categories brief, section 9.
- Own decks take priority over EDHREC — suggested-categories brief, section 9.
- Architect-audit flags (older badge and 16-character rules, EDHREC tag data) are unchanged.

## New decisions made (need owner confirmation)
- None outstanding beyond the remaining open questions in each brief.

## Assumptions
- Preview, 10-card direct limit, 24h approval and 7-day undo follow the existing connector rules in claude-connector-deck-category.md.
- Case-insensitive name matching, 5-category cap, and reserved names Maybeboard/Commander carry over from that contract.

## Challenges to locked decisions
- none. Note: D-010 (secondary category shown as a badge) and a 16-character cap in src/lib/categoryUtils.ts [Confirmed] may sit awkwardly with a 5-category list and the 60-character connector limit; the Architect audit should check.

## Open questions
- See section 9 of each brief. Not audited: EDHREC tag data availability [Approximate: src/lib/commander-build-data.ts holds EDHREC themes per commander, not per-card tags].

## Verification
- Read AGENTS.md, process.md, an existing brief and the category contract; no code run, docs only.
