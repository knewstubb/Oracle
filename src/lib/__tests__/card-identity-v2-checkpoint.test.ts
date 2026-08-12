/**
 * Checkpoint Verification Test: Card Identity v2 Migration & Store
 *
 * SKIPPED: This test verified old SQLite migrations (023, 026) that used the
 * physical_copies and card_definitions tables. The project has since migrated
 * to Supabase with a unified 'collection' and 'cards' schema. These SQLite
 * migrations no longer exist (db/migrations directory was removed).
 *
 * The functionality this tested (quantity grouping, multiple deck_cards
 * referencing the same copy) is now covered by:
 * - card-status.test.ts
 * - deck-cards-diff.test.ts
 * - deck-import-proxy.test.ts
 */

import { describe, it } from 'vitest'

describe.skip('Card Identity v2 Checkpoint (OBSOLETE - SQLite migrations removed)', () => {
  it('placeholder - see file header comment for migration context', () => {
    // This test suite is intentionally skipped.
    // The SQLite migrations it tested have been replaced by Supabase migrations.
  })
})
