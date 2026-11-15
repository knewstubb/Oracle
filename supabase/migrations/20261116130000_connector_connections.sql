-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves. Task CC-04a.
-- Contract: docs/oracle/contracts/claude-connector-slice-a.md (section 6).
-- Reversible: rollback is at the bottom of this file (drops one new, empty-at-first table; no existing data touched).
-- Depends on: nothing. Independent of the CC-03 migrations, but the connector must not go live before those are applied
-- (they are, per docs/oracle/status.md; re-check before apply).
--
-- One row per "Claude is connected to my Oracle" grant. It is a switch, not a token store: the OAuth tokens themselves
-- live in Supabase Auth. This table lets Oracle (a) show the owner the connector is active, (b) switch it off at once, and
-- (c) refuse any token whose connection is not active, on every request.
--
-- Primary key: id. Foreign key: user_id -> auth.users(id) ON DELETE CASCADE.
-- Uniqueness: at most ONE active (not revoked) row per (user_id, client_id). Revoked rows are kept as history.
-- Queries needing indexes: the per-request lookup (user_id, client_id) WHERE revoked_at IS NULL (the unique index below
-- serves it); the owner's list (user_id) (covered by the same index's leading column).
-- Writes: service_role only (consent step creates the row; revoke sets revoked_at; request path bumps last_used_at).
-- Each is a single-row statement, so atomic by itself. Owners may only READ their own rows (RLS).

BEGIN;

CREATE TABLE public.connector_connections (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- client_id is the Supabase OAuth client id (auth.oauth_clients.id) as text. It is NOT a scryfall_id or oracle_id.
  client_id    text        NOT NULL,
  client_name  text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

COMMENT ON TABLE public.connector_connections IS
  'One row per Claude connector grant for a user. Revoked rows kept as history. Checked on every /mcp request.';
COMMENT ON COLUMN public.connector_connections.client_id IS
  'Supabase OAuth client id (text). Identifier of the connecting app, not a card identifier (D-003 n/a).';

CREATE UNIQUE INDEX connector_connections_one_active
  ON public.connector_connections (user_id, client_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.connector_connections ENABLE ROW LEVEL SECURITY;
-- Do NOT use FORCE ROW LEVEL SECURITY (same rule as the CC-03a migration).

CREATE POLICY connector_connections_owner_select
  ON public.connector_connections
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE policy for authenticated: a Claude token (which is an authenticated session) can never create,
-- un-revoke or edit its own connection row. Only the server (service_role, bypasses RLS) writes.

REVOKE ALL ON public.connector_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.connector_connections TO authenticated;
GRANT ALL ON public.connector_connections TO service_role;

COMMIT;

-- ROLLBACK (run only if the connector is being removed; it deletes the connection history):
-- BEGIN;
-- DROP TABLE public.connector_connections;
-- COMMIT;
