# EDHREC Sync — Working Directory

**Status:** Active development  
**Safe to delete:** Yes, after sync feature is stable

This folder contains working documents for the EDHREC data sync feature. Once the feature is complete and stable, this folder can be archived or deleted.

## Contents

| File | Purpose | Migrate to |
|------|---------|------------|
| `tag-mapping-report.md` | Decisions on how EDHREC tags map to our taxonomy | Already captured in `scripts/edhrec-tag-mappings.ts` comments |
| `README.md` | This file | Delete |

## Permanent Documentation

The authoritative docs live elsewhere:

| Topic | Location |
|-------|----------|
| Sync architecture & changelog | `docs/edhrec-sync.md` |
| Tag mapping code | `scripts/edhrec-tag-mappings.ts` |
| Schema definitions | `.kiro/steering/schema-card-data.md` |
| Taxonomy definitions | `docs/category-taxonomy.md` |

## When to Delete

This folder can be cleared when:
- [ ] Build sync covers top 2000 commanders
- [ ] Tag mappings are stable (no unmapped tags appearing)
- [ ] Reclassification script exists (can re-map without re-scrape)
- [ ] All decisions captured in permanent docs

---

*Working doc — created 2026-08-06*
