# Delivery Log — Card Identity & Physical Copies

> Feature: Card Identity & Physical Copies
> Status: Complete (Requirement 1 only; Requirements 2–10 superseded)
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-07-07 — Requirement 1 Shipped, Requirements 2–10 Superseded

**Context:** This spec originally described a printing-group model with quantity columns. Requirement 1 (card definitions keyed by oracle_id) shipped. Requirements 2–10 were superseded by `instance-level-card-tracking` six days later.

**What shipped (Requirement 1):**
- `card_definitions` table with oracle_id as natural key
- Integer PK for FK joins to physical_copies
- Denormalized card_name for display/search
- ~2400 rows for collection at ship time

**What was superseded (Requirements 2–10):**
- Printing-group model replaced by instance-level tracking
- Quantity column dropped in favor of one-row-per-copy
- Migration 007 exploded quantity > 1 rows into N individual rows

**Note:** Anyone reading design.md past Requirement 1 is reading a discarded draft.

**Refs:**
- Spec: `specs/card-identity-physical-copies/` (Req 1 only)
- Superseded by: `specs/_archive/instance-level-card-tracking/`
