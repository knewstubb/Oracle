# Report: Phase 2 spot-check checklist
Role: Gene
Status: DONE
Task as received: "Let's do phase 2 first" (owner, 2026-10-11, after the card-facts fixes T-47 to T-50 merged and migration 20261011120000 was applied).

## Summary for the owner
The card-facts fixes are merged and the data-storage change is live, but nobody has clicked through them yet. This is the five-minute check that decides whether Phase 2 is finished. The app runs on your computer (`npm run dev`) against your online database.

## Checklist (owner, in the running app)
1. **Proxy printing.** Open a deck with a card that asks for a particular printing (for example a Borderless one). Make a proxy for that slot. Expected: the proxy shows that same printing, not the newest one.
2. **Refresh Prices.** On the Collection screen click Refresh Prices. Expected: a message saying how many prices were updated (and how many failed). It must not say "updated" if nothing changed.
3. **Collection value.** Look at the value banner. Expected: a dollar amount; if some cards have no price it says how many ("20 cards have no price yet"). Those cards show "—" in the list.
4. **Card Kingdom.** Expected: no Card Kingdom price or button anywhere (collection and the brew card tooltip).
5. **Hover.** Hover a card in a deck. Expected: the picture is the printing your deck or your copy has, not a different one.
6. **Add by hand.** Add a card to a deck by name. Expected: it picks a printing you own if you own one.

If every line looks right, Phase 2 is DONE. Anything that looks wrong goes back as a fix task.

## Known Phase 2 items intentionally left for other phases
- Etched cards labelled "Foil" and priced by foil/normal only (Phase 4).
- Imports dropping finish, and Moxfield/Archidekt identity problems (Phase 5).
- Failed lookups showing as Unowned (Phase 3 / 7).
- Advisor prices and budget filters (Phase 8).

## Changed files
- docs/oracle/reports/2026-10-11-gene-phase-2-spot-check.md — this checklist

## New decisions made (need owner confirmation)
- none

## Assumptions
- The owner runs the app locally; no Vercel.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Not applicable (document only).
