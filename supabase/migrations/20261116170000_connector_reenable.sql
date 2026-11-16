-- CC-04d. Additive only: two new functions, no table or data change. Undo script: supabase/drafts/20261116170000_connector_reenable.rollback.sql
-- 1) connector_grant_alive: is Claude's saved sign-in for this user and app still good? True only when the grant (auth.oauth_consents) is
--    not revoked AND at least one sign-in session of that app exists that has not passed its end time (a dead refresh token = no session).
-- 2) reenable_connector_connection: turns a switched-off connection back on, only if the grant is alive and no other active row exists.
--    Otherwise returns {success:false, error:'needs_reconnect'} and changes nothing.
BEGIN;

CREATE OR REPLACE FUNCTION public.connector_grant_alive(p_user_id uuid, p_client_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM auth.oauth_consents o WHERE o.user_id = p_user_id AND o.client_id::text = p_client_id AND o.revoked_at IS NULL)
     AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.user_id = p_user_id AND s.oauth_client_id::text = p_client_id
                  AND (s.not_after IS NULL OR s.not_after > now()));
$$;

CREATE OR REPLACE FUNCTION public.reenable_connector_connection(p_user_id uuid, p_connection_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row connector_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_row.revoked_at IS NULL THEN RETURN jsonb_build_object('success', true, 'already_on', true); END IF;
  IF EXISTS (SELECT 1 FROM connector_connections WHERE user_id = p_user_id AND client_id = v_row.client_id AND revoked_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'needs_reconnect');
  END IF;
  IF NOT public.connector_grant_alive(p_user_id, v_row.client_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'needs_reconnect');
  END IF;
  UPDATE connector_connections SET revoked_at = NULL WHERE id = p_connection_id AND user_id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.connector_grant_alive(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reenable_connector_connection(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connector_grant_alive(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reenable_connector_connection(uuid, uuid) TO service_role;
COMMIT;
