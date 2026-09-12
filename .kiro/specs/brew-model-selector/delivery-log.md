# Delivery Log — Brew Model Selector

> Feature: Brew Model Selector
> Status: Complete
> Last updated: 2026-08-12
> Maintained by: Delivery Lead

---

## 2026-06-30 — Feature Shipped

**Context:** Multi-model support added to brew interface.

**What shipped:**
- Model selector dropdown in `BrewTopbar`
- Support for Claude Sonnet 4, Gemini 2.5/3.5 Flash, DeepSeek V4
- Model choice stored per-session, switchable mid-conversation
- Provider adapter pattern normalizing different API shapes
- Cost tracking per message shown in UI

**Decisions made:**
- Model selector available in both Exploring and Building phases
- Provider adapters abstract API differences
- Cost displayed inline with messages

**Refs:**
- Spec: `specs/brew-model-selector/`
- Source: `src/lib/ai-models.ts`, `src/lib/provider-adapter.ts`
