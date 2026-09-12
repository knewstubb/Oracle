-- ============================================================
-- Migration 020: Drop proxy_allocations table
--
-- Safe: all code paths reading/writing this table have been removed
-- in the preceding code deployment (Shared Cards V2 spec).
-- The table contained stale role labels (original/proxy per card_name
-- per deck) that never affected actual resolution — that's now handled
-- by deck_cards.ownership_status at the instance level.
--
-- Refs: .kiro/specs/shared-cards-v2/design.md (Architecture)
-- ============================================================

DROP TABLE IF EXISTS proxy_allocations;
