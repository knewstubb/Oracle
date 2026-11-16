-- Rollback for 20261116200000_connector_collection_copies_view.draft.sql. The view stores nothing, so dropping it loses no data.
drop view if exists public.connector_collection_copies;
