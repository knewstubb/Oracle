# Delivery Log — User Authentication

> Feature: User Authentication
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-04-XX — Feature Shipped (Exact Date Unknown)

**Context:** Supabase Auth with PKCE flow established as authentication foundation.

**What shipped:**
- PKCE flow for SPA security
- Middleware protecting all routes except `/login` and `/auth/callback`
- Admin client pattern (`createAdminClient()`) for server-side queries
- Session refresh handled transparently in middleware
- 401 response for unauthenticated API requests

**Decisions made:**
- PKCE over implicit grant for better security
- RLS bypassed server-side via admin client pattern
- Email/password only — no social login providers

**Known limitations:**
- No password reset flow in UI (Supabase dashboard only)
- Single-user app in practice

**Refs:**
- Spec: `specs/user-authentication/`
- Source: `src/lib/auth.ts`, `src/middleware.ts`
