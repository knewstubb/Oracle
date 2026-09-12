# Security Audit — The Oracle

**Date:** 2026-07-19
**Scope:** Next.js 16 App Router + Supabase (PKCE auth) + Vercel deployment
**Application Type:** Single-user deck management tool with AI features

---

## Executive Summary

The Oracle has a solid authentication foundation — middleware blocks all unauthenticated page and API access, and almost all API routes call `requireAuth()`. However, the primary risk surface is **IDOR (Insecure Direct Object Reference)** vulnerabilities: because the admin client bypasses RLS and several routes don't filter queries by `user_id`, a second user (or a future multi-user scenario) could access or modify another user's data by guessing record IDs. In the current single-user deployment this is unexploitable, but it represents architectural debt that would become critical immediately upon adding a second user.

Secondary concerns include missing security headers, no application-level rate limiting on expensive AI endpoints, and a conditional auth bypass on the cron endpoint.

---

## Findings

### 1. Authentication & Authorization

#### 1.1 Cron Endpoint — Conditional Auth Bypass

| | |
|---|---|
| **Severity** | Medium |
| **File** | `src/app/api/cron/refresh-prices/route.ts` |
| **Exploitable (single-user)** | Yes — if CRON_SECRET is unset |

The cron route only validates the `Authorization: Bearer <CRON_SECRET>` header **if** `CRON_SECRET` is set:

```typescript
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
```

If `CRON_SECRET` is not configured in the Vercel environment, this endpoint is completely open to the internet. Anyone can trigger a full price refresh (hitting Scryfall API ~30+ times).

**Same pattern exists in:** `src/app/api/collection/prices/refresh/route.ts` (GET handler).

**Recommendation:** Invert the logic — reject if `!cronSecret` (fail-closed). Or always require the header and reject if missing.

```typescript
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
```

---

#### 1.2 Dev Reset Route — Available in Production

| | |
|---|---|
| **Severity** | Medium |
| **File** | `src/app/api/dev/reset/route.ts` |
| **Exploitable (single-user)** | Yes — by authenticated user only |

The `POST /api/dev/reset` endpoint deletes all user data (decks, cards, copies, brew sessions). It's gated by `requireAuth()` but has **no environment check** — it's available in production. An attacker who compromises the session could wipe all data.

**Recommendation:** Gate behind `NODE_ENV === 'development'` or a feature flag. Return 404 in production.

---

#### 1.3 Middleware Coverage — Solid

| | |
|---|---|
| **Severity** | Info |
| **File** | `src/middleware.ts` |

The middleware correctly:
- Blocks all non-public routes (only `/login` and `/auth/callback` are public)
- Returns 401 for API routes instead of redirecting
- Refreshes the session token via `getUser()` on every request
- Uses a comprehensive matcher that excludes only static assets

The middleware acts as a defence-in-depth layer. Even if an API route forgot `requireAuth()`, the middleware catches it. The 5 routes without explicit `requireAuth()` calls (`cards/autocomplete`, `cron/refresh-prices`, `scan/ocr`, `scan/ocr-title`, `scryfall/commanders`) are still protected by middleware — except the cron route which uses bearer token auth instead.

---

### 2. IDOR — Missing user_id Filters (Admin Client Bypass)

#### 2.1 GET /api/decks — Returns All Users' Decks

| | |
|---|---|
| **Severity** | High (multi-user) / Low (single-user) |
| **File** | `src/app/api/decks/route.ts` |
| **Exploitable (single-user)** | No |

Queries the `decks` table (which has a `user_id` column) without any `.eq('user_id', ...)` filter. Uses admin client which bypasses RLS. In a multi-user scenario, this leaks every user's deck list.

---

#### 2.2 GET /api/decks/[id] — Access Any Deck by ID

| | |
|---|---|
| **Severity** | High (multi-user) / Low (single-user) |
| **File** | `src/app/api/decks/[id]/route.ts` |
| **Exploitable (single-user)** | No |

Fetches deck by numeric ID without verifying `deck.user_id === authResult.id`. An attacker could enumerate deck IDs to read another user's complete deck contents, card lists, and brew sessions.

The DELETE handler has the same pattern — no ownership check.

---

#### 2.3 GET /api/collection — Returns Unfiltered Collection

| | |
|---|---|
| **Severity** | High (multi-user) / Low (single-user) |
| **File** | `src/app/api/collection/route.ts` |
| **Exploitable (single-user)** | No |

The `collection` table has a `user_id` column but the query has no filter on it. Returns all rows regardless of ownership.

---

#### 2.4 GET /api/collection/stats — Unfiltered Stats

| | |
|---|---|
| **Severity** | Medium (multi-user) / Low (single-user) |
| **File** | `src/app/api/collection/stats/route.ts` |
| **Exploitable (single-user)** | No |

Queries the `collection` table without user filtering for counts and stats.

---

#### 2.5 DELETE /api/brew-sessions/[id] — No Ownership Verification

| | |
|---|---|
| **Severity** | High (multi-user) / Low (single-user) |
| **File** | `src/app/api/brew-sessions/[id]/route.ts` |
| **Exploitable (single-user)** | No |

Deletes any brew session by ID without verifying it belongs to the authenticated user. Only checks `status !== 'complete'`.

---

#### 2.6 Pattern: Inconsistent user_id Usage

| | |
|---|---|
| **Severity** | Medium |
| **Files** | Multiple |

Some routes correctly filter by user_id (e.g., `collection/export`, `collection/value`, `shared-cards`, `collection/rollup-v2`, `decks/[id]/cards POST`), while others on the same resource don't. This inconsistency makes it harder to audit and increases the risk of future regressions.

**Recommendation:** Create a helper function `queryForUser(supabase, table, userId)` that always includes the user_id filter, or add a linting rule that flags `.from('decks')` without a subsequent `.eq('user_id', ...)`.

---

### 3. Admin Client Usage

#### 3.1 Admin Client Properly Server-Side Only

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **File** | `src/lib/supabase.ts` |

The `createAdminClient()` function:
- Uses `SUPABASE_SERVICE_ROLE_KEY` (not NEXT_PUBLIC_, not exposed to client)
- Is only imported in server-side files (API routes, lib modules)
- The browser client correctly uses the anon key

The only client component importing from `@/lib/supabase` is the login form, which uses `createBrowserClient()` (anon key).

---

### 4. Input Validation

#### 4.1 OCR Endpoints — No Payload Size Limit

| | |
|---|---|
| **Severity** | Medium |
| **Files** | `src/app/api/scan/ocr/route.ts`, `src/app/api/scan/ocr-title/route.ts` |
| **Exploitable (single-user)** | Yes |

Both OCR routes accept a `{ image: string }` body (base64-encoded image) with no size validation. A malicious request could send an extremely large base64 string (hundreds of MB), consuming server memory and potentially causing OOM on the Vercel function.

Next.js App Router has a default body size limit of 4MB, which provides some protection, but this is still generous for an image endpoint.

**Recommendation:** Validate the base64 string length before processing:
```typescript
if (image.length > 5_000_000) { // ~3.7MB decoded
  return Response.json({ error: 'Image too large' }, { status: 413 })
}
```

---

#### 4.2 CSV Import — No Row Count Limit

| | |
|---|---|
| **Severity** | Low |
| **File** | `src/app/api/collection/import/route.ts` |
| **Exploitable (single-user)** | Yes |

The CSV import accepts arbitrarily large files and processes all rows. A CSV with millions of rows could exhaust the Vercel function timeout (or memory). The `BATCH_SIZE = 200` prevents individual Supabase calls from being too large, but there's no cap on total rows.

**Recommendation:** Add a maximum row count (e.g., 50,000) and reject larger imports with a clear error.

---

#### 4.3 Search Parameters — SQL Injection Not Applicable

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **File** | `src/app/api/collection/route.ts` |

The Supabase JS client uses parameterized queries internally. The `.ilike('card_name', \`%${search}%\`)` pattern is safe because PostgREST handles parameterization. No raw SQL is used anywhere in the application layer.

---

#### 4.4 No dangerouslySetInnerHTML Usage

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **Files** | All components |

Zero instances of `dangerouslySetInnerHTML` found in the codebase. XSS risk from rendered content is minimal.

---

### 5. Secrets & Environment Variables

#### 5.1 .env Files Properly Gitignored

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **File** | `.gitignore` |

`.env*` is in `.gitignore`. No env files are tracked in git. The `.env.local.example` contains only placeholder values.

---

#### 5.2 NEXT_PUBLIC_ Variables Are Appropriate

| | |
|---|---|
| **Severity** | Info (Positive finding) |

Only exposed to the client:
- `NEXT_PUBLIC_SUPABASE_URL` — public project URL (by design)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key (by design, RLS enforced)
- `NEXT_PUBLIC_APP_VERSION` — version string (harmless)

Service role key, Anthropic API key, and cron secret are server-only.

---

#### 5.3 TypeScript Build Errors Ignored

| | |
|---|---|
| **Severity** | Low |
| **File** | `next.config.ts` |

```typescript
typescript: { ignoreBuildErrors: true }
```

This means type errors won't prevent deployment. Type errors can mask security issues (e.g., a function expecting `User` receiving `null`). Two files also use `@ts-nocheck` (`brew/chat`, `brew/skeleton`).

**Recommendation:** Remove `ignoreBuildErrors` and fix type errors. Remove `@ts-nocheck` directives.

---

### 6. API Rate Limiting

#### 6.1 No Application-Level Rate Limiting

| | |
|---|---|
| **Severity** | Medium |
| **Files** | All AI routes, collection/refresh-prices |
| **Exploitable (single-user)** | Yes |

There is no rate limiting on any endpoint. The rate limiting that exists (SCRYFALL_RATE_LIMIT_MS) is for outbound calls to Scryfall, not for incoming requests.

An authenticated attacker (or a compromised session) could:
- Spam `POST /api/brew/chat` to burn Anthropic API credits (each call costs ~$0.01-0.10)
- Spam `POST /api/collection/refresh-prices` to hit Scryfall's rate limits and get the IP banned
- Spam `POST /api/ai/brew/start` to create thousands of brew sessions

Vercel does provide some DDoS protection at the edge, but application-level abuse (valid auth, expensive operations) is not mitigated.

**Recommendation:** Add per-user rate limiting on expensive endpoints. Options:
- Vercel KV-based sliding window (simplest for Vercel deployment)
- Upstash Redis rate limiter
- In-memory rate limiting (resets on cold start, but still helpful)

Priority endpoints: `/api/brew/chat`, `/api/ai/*`, `/api/collection/refresh-prices`

---

### 7. CORS & Security Headers

#### 7.1 No Security Headers Configured

| | |
|---|---|
| **Severity** | Medium |
| **Files** | `next.config.ts`, `middleware.ts` |
| **Exploitable (single-user)** | Depends on attack vector |

No custom security headers are set anywhere:
- No `Content-Security-Policy` — allows inline scripts, any source for images/scripts
- No `X-Frame-Options` or `frame-ancestors` — page can be iframed (clickjacking)
- No `X-Content-Type-Options` — MIME sniffing possible
- No `Strict-Transport-Security` — Vercel adds this by default, but explicit is better
- No `Referrer-Policy` — full referrer sent to external origins
- No `Permissions-Policy` — browser features unrestricted

**Recommendation:** Add headers via `next.config.ts`:

```typescript
headers: async () => [
  {
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' https://cards.scryfall.io https://api.scryfall.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" },
    ],
  },
],
```

---

#### 7.2 No Explicit CORS Configuration

| | |
|---|---|
| **Severity** | Low |
| **File** | All API routes |

No CORS headers are set on any API route. By default, Next.js API routes on Vercel only respond to same-origin requests (browser's same-origin policy). Cross-origin fetch from another domain would fail.

This is acceptable for a single-user app with no public API.

---

### 8. Deployment Security

#### 8.1 vercel.json — Minimal, Low Risk

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **File** | `vercel.json` |

Only contains a cron schedule. No rewrites, headers, or function configs that could introduce vulnerabilities.

---

#### 8.2 Source Maps — Default (Not Exposed)

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **File** | `next.config.ts` |

`productionBrowserSourceMaps` is not set (defaults to `false`). Source maps are not exposed in production.

---

#### 8.3 manifest.json — Minimal Information Leakage

| | |
|---|---|
| **Severity** | Info |
| **File** | `public/manifest.json` |

Exposes app name ("The Oracle") and description ("Commander deck management and AI-powered analysis"). This is standard for PWAs and not a security concern.

---

### 9. Dependencies

#### 9.1 17 Known Vulnerabilities (npm audit)

| | |
|---|---|
| **Severity** | High (for undici), Low-Moderate (others) |
| **File** | `package.json` / `package-lock.json` |
| **Exploitable (single-user)** | Potentially — undici issues affect HTTP client |

Key findings:
- **undici** (8 high): TLS bypass, HTTP header injection, response queue poisoning, cookie issues. These are in the HTTP client used by `fetch()` internally. `npm audit fix` resolves these.
- **vite** (2 high): File system deny bypass, NTLMv2 hash disclosure. Dev-only dependency — not deployed.
- **@hono/node-server** (1 moderate): Path traversal. Transitive via `shadcn` CLI — dev tool, not deployed.
- **body-parser** (1 low): DoS via invalid limit. Transitive, likely unused.
- **@babel/core** (1 low): Arbitrary file read via source maps. Build-time only.

**Recommendation:** Run `npm audit fix` to resolve the undici vulnerabilities (affects production `fetch()` calls). The vite/hono/babel issues are dev-only and lower priority.

---

### 10. Session Management

#### 10.1 Supabase PKCE Flow — Well Configured

| | |
|---|---|
| **Severity** | Info (Positive finding) |
| **Files** | `src/middleware.ts`, `src/app/auth/callback/route.ts` |

- Uses `@supabase/ssr` cookie-based session management
- Session refresh happens on every request (middleware calls `getUser()`)
- Auth callback properly exchanges PKCE code for session
- Cookies are set via the response (httpOnly by default via Supabase SSR library)
- Session expiry is managed by Supabase (default: 1 hour access token, 7 day refresh)

---

#### 10.2 Cookie Flags — Managed by Supabase SSR

| | |
|---|---|
| **Severity** | Info |
| **File** | `src/middleware.ts` |

The `@supabase/ssr` library sets cookie attributes (httpOnly, secure, sameSite) based on the Supabase project configuration. These aren't explicitly set in the application code, but the library defaults are secure:
- `httpOnly: true` for the refresh token
- `secure: true` when served over HTTPS (Vercel always uses HTTPS)
- `sameSite: lax` by default

---

## Risk Matrix

| # | Finding | Severity | Single-User Risk | Multi-User Risk | Fix Effort |
|---|---------|----------|-----------------|-----------------|------------|
| 2.1 | Decks list — no user_id filter | High | None | Critical | Low |
| 2.2 | Deck detail — no ownership check | High | None | Critical | Low |
| 2.3 | Collection — no user_id filter | High | None | Critical | Low |
| 2.5 | Brew session delete — no ownership check | High | None | Critical | Low |
| 1.1 | Cron auth bypass when secret unset | Medium | Exploitable | Exploitable | Trivial |
| 1.2 | Dev reset available in production | Medium | Exploitable | Exploitable | Trivial |
| 6.1 | No rate limiting on AI endpoints | Medium | Exploitable (cost) | Exploitable | Medium |
| 7.1 | No security headers | Medium | Low | Medium | Low |
| 4.1 | OCR — no payload size limit | Medium | Exploitable | Exploitable | Trivial |
| 9.1 | undici vulnerabilities | High | Possible | Possible | Trivial (npm fix) |
| 5.3 | TS build errors ignored | Low | N/A | N/A | Medium |
| 2.4 | Collection stats — no user filter | Medium | None | Medium | Low |
| 4.2 | CSV import — no row limit | Low | DoS risk | DoS risk | Trivial |
| 7.2 | No CORS headers | Low | None | None | N/A |
| 2.6 | Inconsistent user_id patterns | Medium | None | High | Medium |

---

## Recommended Fix Priority

### Immediate (before adding any second user)
1. Add `.eq('user_id', userId)` to all queries using the admin client on user-owned tables
2. Run `npm audit fix` for undici vulnerabilities
3. Set `CRON_SECRET` and invert the auth check to fail-closed
4. Gate `/api/dev/reset` behind environment check

### Short-term
5. Add security headers via `next.config.ts`
6. Add base64 size validation to OCR endpoints
7. Add rate limiting to AI/brew endpoints (even a simple in-memory counter per user)
8. Remove `ignoreBuildErrors: true` from next.config.ts

### Medium-term
9. Add a `requireDeckOwner(deckId, userId)` helper and use it in all deck routes
10. Consider adding application-level rate limiting via Vercel KV or Upstash
11. Add CSV row count limits to the import endpoint
12. Audit all routes for consistent user_id filtering

---

## Notes

- The middleware provides strong defence-in-depth — even routes without explicit `requireAuth()` are protected by the middleware matcher
- The application correctly separates browser client (anon key + RLS) from admin client (service role key)
- The IDOR vulnerabilities are currently theoretical in a single-user deployment but become immediately exploitable with a second user
- No evidence of secrets committed to git
- No XSS vectors found (no dangerouslySetInnerHTML, no raw HTML rendering)
- SQL injection is not possible due to Supabase client's parameterized queries
