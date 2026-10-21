# Architect report: Generic basic lands (2026-10-21)

## Summary (plain language)
- Your rules fit the app well. The one real problem: imported generic lands are saved with a default picture, but most of the app only counts a basic as generic when it has no picture at all. So imported generics probably show up wrongly (as missing or unowned cards, in the pick list and shortages). [Approximate: found by reading the code, not run on live data.]
- Fix: give every deck slot an explicit "this is a generic basic" marker. It can keep its picture, finish and language, and holds no copy.
- No swap feature: remove and re-add instead; generics get add / change count / remove controls.
- Removing the toggle is simple: the Round 13 rule (no set and number means generic) is the only rule.
- Today's "make generic" action does not hand a real copy back to storage; that action is retired.

## Update (owner answers, rev 3, final simplifications)
- A plain "11 Plains" starts Sleeved. Only lines you set Unsleeved are Unsleeved. The deck-level Unsleeved choice does not override.
- No swap feature. To change a specific land into a generic, remove the land normally (its copy goes back to storage) and raise the generic count; the reverse is lower the count and add the card normally. Swap actions, buttons and tests are removed. What stays: add generic, change count, remove generic.
- Sleeved state is all or nothing for each basic type in a deck. I recommend per basic type rather than per finish or language line, because it matches the single generic line per type in the decklist. It is still stored on each row, but one action sets the whole line. Raising the count on an Unsleeved line makes the new ones Unsleeved too; a line with none yet starts Sleeved. If an import gives a mix for one type (plain "6 Plains" plus "5 Plains" set Unsleeved), the whole type becomes Unsleeved and the result screen says so.
- Earlier answers still apply: generics store finish, language and stored random owned art; existing decks ignored; migration is schema-only.

## Changed files
- docs/oracle/contracts/generic-basic-lands.md (rev 3)
- supabase/migrations/20261021120000_deck_cards_is_generic.sql (DRAFT, NOT APPLIED; comment tweak only)
- This report. No app code, no decisions.md change.

## Assumptions
Deployed state per status.md unchanged. The sleeved N/100 calculation location is not confirmed [Approximate]; the Developer must find every place.

## Questions for you
1. Is "Unsleeved wins" right when one import line says Unsleeved and another plain line of the same basic does not? (My recommendation: yes, so a deck is never counted as more sleeved than you asked.)

## For Gene (decisions.md)
D-048 superseded; D-032 extended and its "automatically Sleeved" clause changed (generics Sleeved by default, can be Unsleeved); D-031 and D-002 same clause; D-047 note that generics can be Unsleeved; D-039: the "switching to generic" clause may now be deleted since no switch exists; D-051 still pending. The older import-row-editing contract's D-048 note is superseded.

## Developer order
1 apply migration, regenerate types; 2 one generic check replacing four picture-based checks, lifecycle from the flag (fixes the bug); 3 sleeved-count calculation counts generics by flag; 4 stored default-art function; 5 count-change action plus line-level Sleeve/Unsleeve, retire the old clearing edit; 6 import writes new fields, toggle removed; 7 deck page add / count / remove generic controls and decklist lines; 8 row editor for generic rows (after the T-56 branch `test-t56-local` merges); 9 tests.

## Verification
Read-only code review; nothing executed or applied.
