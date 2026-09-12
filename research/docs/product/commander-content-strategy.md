# Commander Content Aggregation Strategy

## Goal

Collect, distill, and surface strategy information for commanders to help users during brew sessions and deck exploration. Enable:
- Filtering commanders by strategy/archetype during brew
- Suggesting strategies when user picks a commander
- Surfacing relevant insights without drowning in noise

---

## Storage Architecture

**Hybrid approach** — Raw content stored locally, distilled content in Supabase.

| Data | Storage | Reason |
|------|---------|--------|
| Raw article content | Local SQLite (`data/content-raw.sqlite`) | Unlimited, free, batch processing |
| Distilled summaries | Supabase (`commander_content`) | App queries, small footprint |
| Strategy themes | Supabase (`commander_strategies`) | App queries, structured data |

### Local SQLite Schema (`data/content-raw.sqlite`)

```sql
CREATE TABLE raw_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL UNIQUE,
  card_name TEXT NOT NULL,
  source TEXT NOT NULL,           -- 'edhrec_article', 'commanders_herald', etc.
  title TEXT,
  author TEXT,
  published_date TEXT,
  excerpt TEXT,
  full_content TEXT,              -- Full article body (fetched separately)
  fetched_at TEXT,
  content_fetched_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Supabase Schema (`commander_content`)

```sql
CREATE TABLE commander_content (
  id SERIAL PRIMARY KEY,
  card_name TEXT NOT NULL REFERENCES ref_cards(name),
  source TEXT NOT NULL,
  source_url TEXT,
  title TEXT,
  distilled_summary TEXT,         -- AI-generated summary
  key_points TEXT[],              -- AI-extracted key points
  fetched_at TIMESTAMPTZ,
  distilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Phase 1: EDHREC Themes (Complete)

**Status:** Implemented

**Source:** EDHREC JSON API (`json.edhrec.com/pages/commanders/{slug}.json`)

**Data captured:**
- `primary_strategy` — Most popular theme by deck count
- `secondary_strategies` — Themes 2-5 by popularity
- `edhrec_themes[]` — Full list of all themes (50-150+ per commander)
- `theme_count` — Number of distinct themes

**Storage:** `commander_strategies` table

**Script:** `scripts/fetch-edhrec-themes.ts`

**Refresh cadence:** TBD (monthly? quarterly?)

---

## Phase 2: EDHREC Articles (Complete)

**Status:** Implemented with hybrid storage

**Decision:** Using Option B — separate `commander_content` table + local SQLite

**Discovery:** Articles are already embedded in the commander JSON response!

```json
"panels": {
  "articles": [
    {
      "date": "Jul 22, 2026",
      "href": "https://edhrec.com/articles/...",
      "value": "Article Title",
      "author": { "name": "Mike Carrozza" },
      "excerpt": "Brief description..."
    }
  ]
}
```

**Data captured:**
- Article title and URL
- Publication date
- Author name
- Excerpt/summary

**Storage:**
- Raw content → `data/content-raw.sqlite` (local)
- Distilled summaries → `commander_content` (Supabase)

**Script:** `scripts/fetch-edhrec-themes.ts` (handles both themes and articles)

### Future Sources (Prioritized)

| Priority | Source | Content Type | Status |
|----------|--------|--------------|--------|
| 1 | EDHREC articles | Strategy guides | Next |
| 2 | Commander's Herald | Archetype deep-dives | Planned |
| 3 | Reddit r/EDH | Community discussions | Planned |
| 4 | MTGGoldfish | Budget builds | Backlog |

---

## Phase 3: AI Distillation (Batch Processing)

**Decision:** Batch weekly processing

### Pipeline

1. **Fetch** — Weekly cron scrapes new articles from EDHREC → local SQLite
2. **Store** — Raw content saved to `data/content-raw.sqlite`
3. **Distill** — LLM processes raw content into structured summary
4. **Update** — `distilled_summary` and `key_points` written to Supabase `commander_content`

## Decisions Made

| Decision | Choice | Date |
|----------|--------|------|
| Phase 2 source priority | EDHREC articles first | 2026-07-30 |
| Schema approach | Option B — separate `commander_content` table | 2026-07-30 |
| Distillation approach | Batch weekly processing | 2026-07-30 |
| Article data source | Embedded in commander JSON (no extra scraping needed for metadata) | 2026-07-30 |
| Storage architecture | Hybrid — raw content local, distilled in Supabase | 2026-07-30 |

---

## Implementation Plan

### Phase 1: EDHREC Themes ✅
- [x] Create `commander_strategies` table
- [x] Build scraper script
- [x] Populate 967 commanders with themes

### Phase 2: EDHREC Articles ✅
- [x] Create `commander_content` table (Supabase)
- [x] Create `raw_content` table (local SQLite)
- [x] Extend scraper to extract articles from commander JSON
- [x] Store article metadata to local SQLite
- [x] Hybrid storage architecture (raw local, distilled Supabase)
- [ ] Run full batch for all commanders
- [ ] (Optional) Fetch full article content for deeper distillation

### Phase 3: AI Distillation
- [ ] Design prompt template for summarizing articles
- [ ] Create batch processing script
- [ ] Populate `distilled_summary` and `key_points` fields

### Phase 4: UI Integration
- [ ] Add strategy filter to brew commander picker
- [ ] Show strategy suggestions when user selects commander
- [ ] Display article excerpts as additional context

---

## Open Questions for Discussion

- **Source priority:** EDHREC articles (authoritative) vs. Reddit (current/community)?
- **Distillation depth:** Quick tags vs. full summaries?
- **User contribution:** Should users be able to add/edit strategy notes?
- **Versioning:** Track how strategies evolve over time?
