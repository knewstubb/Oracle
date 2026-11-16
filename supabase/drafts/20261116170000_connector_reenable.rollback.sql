-- Undo for 20261116170000_connector_reenable.sql. Drops two functions only; no data touched.
BEGIN;
DROP FUNCTION IF EXISTS public.reenable_connector_connection(uuid, uuid);
DROP FUNCTION IF EXISTS public.connector_grant_alive(uuid, text);
COMMIT;
