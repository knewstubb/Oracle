# Spot-check review: full-app audit (2026-11-22)

Verdict: APPROVED. No blockers. Nothing was changed except this file and the JSON.

## 1. Removal-candidate sample (17 candidates)
Searches covered `src scripts tests next.config.* vercel.json package.json`, template-string and `${base}` built URLs, dynamic `import()`, `tool-registry.ts` (its only fetches go to `/api/commanders/search` and Scryfall), `src/app/api/connector`, `src/middleware.ts`, and `decisions.md` plus `briefs/`.

| RC | Search and result | Verdict |
|---|---|---|
| RC-01 Curve view | `CurveView\|useCurveBuckets\|CurveColumn\|CurveCardRow\|'curve'`: only `DeckCanvas.tsx:14,387`, `CanvasToolbar.tsx`, a type in `brew-v2-types.ts`. `WorkbenchTab.tsx:235` `showToolbar={false}`. The BrewCanvas and DeckChatTab mounts use the default toolbar, so the option is reachable only behind the chat switch. Decisions and briefs mention "curve" only for the left-rail mana curve chart, not this view. | confirmed |
| RC-03 HealthStrip, DeckHealthButton, HealthPill | Matched only each other plus `HealthStrip.chat.test.tsx`. | confirmed |
| RC-04 DeckEditor, PersistentHeader, KeyCards/Weakness/Strategy/Ratings/Primer sections | Matched only own files and own tests. `accessibility.test.tsx` imports `DeckEditor` (a test needs editing on removal). | confirmed |
| RC-05 StatusControl and `/api/decks/[id]/status` | Only caller is `StatusControl.tsx:43`, itself unused. | confirmed |
| RC-06 Sidebar, MobileHeader | No importer. `ImportModalLayout.test.tsx` has the word in a string. | confirmed |
| RC-10/11 `api/brew/{commit,positions,assess,extract}` | Only own tests and one comment in `brew/chat/route.ts:664`. No client fetch. | confirmed |
| RC-15 Push to Archidekt | `PushToArchidekt.tsx` fetches `/push` but is itself unimported. `create-deck` is a 501 stub. Nothing in decisions or briefs. | confirmed |
| RC-16/17 allocation resolve, candidates, `/allocate` | No caller in `src`, `scripts`, `tests`. | confirmed |
| RC-18 `/api/cards/autocomplete` | Only `src/middleware.ts:7` (a public-route allow-list entry). The route is unused, but removal must also edit the middleware list. The report already raises sign-in on the search box. | confirmed (needs a middleware edit) |
| RC-19/20 deck `strategy`, `mana`, `overview`, `dead-weight` GET, `folders/[id]`, `import-alerts`, `breakdown` | Only `strategy-window`, `dead-weight/dismiss`, `/api/storage/overview` matched, all different routes. No `${base}` use for these. | confirmed |
| RC-29 `csv-deck-parser`, `scryfall-bulk-cache` | Imported only by tests (`import-csv.test.ts`, `identity-resolver.test.ts`, which imports a type). | confirmed (tests go with them) |
| RC-31/33/35 CollectionValueBanner, generic-count-queue, CardDataStaleNotice | Banner and notice are imported only by their own tests. Queue has no importer. | confirmed |
| RC-36 cron refresh-prices | `vercel.json` registers it, so it runs today if Vercel is deployed. The audit does not say "safe now". It is a conditional question to the owner (open question 7). | confirmed as conditional |
| RC-37 dev/reset | Only `settings/page.tsx:25`. Route returns 404 in production. | confirmed |
| RC-38 packages | `@phosphor-icons/react`, `persist-client`: only `package.json`. `next-themes`: only `vi.mock` in two tests (`Sidebar.test`, `accessibility.test`), no import. | confirmed |
| RC-39 ui command, input-group, radio-group, cmdk | `command` and `radio-group` have no importer. `input-group` only from `command`. `cmdk` only in `command.tsx`. | confirmed |
| RC-40 youtube packages | Only `package.json` in the app. | confirmed |
| RC-51 branches | `git branch -a --no-merged main` is empty. | confirmed |

Sample size 17 (route, component, lib, folder, test, dependency, flag, script/cron, branch). Docs (RC-48/49) were not searched. Result: 17 confirmed, 0 wrong, 0 uncertain.

## 2. Route coverage
`find src/app` gives 205 page or route files. All 19 non-API pages are in rows 174 to 187. All 4 non-API route files (`/auth/callback`, `/mcp`, two `.well-known`) are in rows 185 and 187. All 29 top-level `/api` folders appear in rows 188 to 198. `api/folders/[id]` is split correctly: the base `route.ts` is "live" and `[id]` is dead (RC-20). Missing: none.

## 3. Owner summary
Lines 9 to 80 of the report contain no code, paths, or line numbers. The only path is in the report header above the owner summary. It opens with "Your instinct is right." and gives plain numbers. The "What I need from you" item with options has three (a, b, c), recommendation first. Minor: "routes" appears once, and "ask you" wording is plain enough. Pass.

## 4. Inventory rows checked against code
1. Row 94 Workbench HALF-BUILT: `WorkbenchTab.tsx:200` PATCHes `/cards/[name]/category`, and no `category` route exists under `src/app/api/decks`. Positions are held in state only. Confirmed.
2. Row 95 Curve ABANDONED: confirmed as above.
3. Strategy "Sync to Archidekt": `StrategyTab.tsx:595-597` confirm shows a success toast and sends nothing. "Add category" button has no onClick. Confirmed.
4. Upgrade "Refresh": `upgrade/refresh/route.ts:47-53` upserts an empty candidates list. Confirmed.
5. Chat hidden behind a switch: `ai-chat-switch.ts` reads `NEXT_PUBLIC_AI_CHAT_ENABLED === 'true'`, 24 UI call sites, routes return 503. Confirmed. Also "Clear All Data": `settings/page.tsx:25` calls `/api/dev/reset`, which 404s in production. Confirmed.

## Notes (non-blocking)
- Removing the curve view also touches the `'curve'` layout type in `brew-v2-types.ts:205` and the toolbar option. This is inside the described slice.
- No locked decision or approved brief depends on any sampled item.
