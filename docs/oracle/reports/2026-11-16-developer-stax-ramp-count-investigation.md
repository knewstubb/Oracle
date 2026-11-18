# Report: stax-ramp-count-investigation
Role: Developer
Status: DONE
Task as received: Investigate why deck health for "Stax on Stax" (deck 792324746, Urza, Lord High Artificer) counts 5 ramp (EDHREC avg 9) and 8 draw; suspected misses: Sapphire Medallion, Basalt Monolith, Seat of the Synod, Power Depot. Investigate only.

## Summary for the owner
The deck health count is worked out live from each card's rules text; nothing is stored or stale. It is a mix of intended behaviour and a rule gap. Lands (Seat of the Synod, Power Depot) are deliberately never counted as ramp. Sapphire Medallion is not counted because it only reduces costs. Basalt Monolith should be counted.

## Findings
- Roles are decided by one pure function reading type line and rules text; no stored tags or categories feed deck health. [Confirmed: src/lib/card-roles.ts, src/lib/deck-health.ts]
- Lands: any card whose front face is a land is classed "land" and gets no roles. Seat of the Synod (Artifact Land) and Power Depot are intended exclusions. [Confirmed: card-roles.ts isLandTypeLine; deck-health.ts classifyDeckCard]
- Ramp rules: land fetch to battlefield, extra land drop, treasure makers, or a non-instant/sorcery permanent whose text says "Add {mana}". Nothing recognises cost reduction. [Confirmed: card-roles.ts isRamp]
- Sapphire Medallion ("Blue spells you cast cost {1} less"): no role. Rule gap (or a definition choice). Same for Etherium Sculptor, Urza's Incubator and similar cost reducers. Probed with the real function: all return no roles.
- Basalt Monolith: probed with the real function, it returns ramp. So if Claude says it is missed, the cause is data (the card has no text row in the card reference table, so it is "unclassified") or Claude was reading a different source. Not verified in the DB (see Open questions).
- Sol Ring, Thran Dynamo, Mind Stone also probe as ramp; Mind Stone also draw.
- Draw: needs "draw two/three/X cards", or "draw a card" on a trigger or ability. Plain cantrips and "may draw unless pays" style lines are handled; opponent draws are excluded. Draw count of 8 looks plausible; not audited card by card.
- Targets: EDHREC's number comes from the commander page averages (mana artifacts etc.), which include lands-adjacent and cost-reducing artifacts differently from our text rules, so a 5 vs 9 gap is partly definition mismatch. [Approximate]

## Verdict
- Seat of the Synod, Power Depot: intended behaviour.
- Sapphire Medallion: classifier rule gap (if cost reducers should count as ramp).
- Basalt Monolith: should already count; check deck data.
- Stale tags: not applicable, nothing stored.

## Recommended fix options
1. Do nothing on lands; add a "cost reducer" rule to ramp (text like "spells you cast cost {N} less", artifact/creature type) and bump CLASSIFIER_VERSION plus the ROLE_TEXT_NEEDLES ("less to cast"). Closest to how players and EDHREC see Medallion-style cards. Risk: inflates counts for cheap-spell cards.
2. Also count mana-producing lands in a separate "mana lands" note, not in ramp. Needs owner decision and spec; changes the lands row.
3. Leave as is and show on the Ramp row that lands and cost reducers are excluded. No logic change.

## Changed files
- docs/oracle/reports/2026-11-16-developer-stax-ramp-count-investigation.md — this report only. No code changed (a temporary probe test was created and deleted).

## Open questions
- Should cost reducers count as ramp? Should utility lands count at all?
- DB not queried: confirm whether Basalt Monolith has oracle text in the card reference table and is in the main deck (not maybeboard).

## Verification
- Temporary vitest probe of rolesForCard on the sample cards — results above; file removed.
