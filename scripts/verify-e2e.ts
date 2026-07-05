/**
 * End-to-End Verification Script
 *
 * Validates that the application layer functions correctly against Supabase
 * after the full migration (schema + data + client swap).
 *
 * Checks performed:
 *   1. Collection data loads correctly (query, verify row count > 0)
 *   2. Deck lists display correctly (query decks, verify expected decks exist)
 *   3. Price cache queries function (query card_kingdom_prices, verify entries)
 *   4. CRUD operations work (insert → read → update → delete against a test row)
 *
 * Usage:
 *   npx tsx scripts/verify-e2e.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks fail
 *
 * Validates: Requirements 9.1
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string
  passed: boolean
  details: string[]
  duration: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

function printResult(result: CheckResult): void {
  const icon = result.passed ? '✅' : '❌'
  console.log(`${icon} ${result.name} (${formatDuration(result.duration)})`)
  for (const detail of result.details) {
    console.log(`   ${detail}`)
  }
  console.log()
}

function printHeader(text: string): void {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${text}`)
  console.log(`${'─'.repeat(60)}\n`)
}

// ---------------------------------------------------------------------------
// Check 1: Collection Data Loads
// ---------------------------------------------------------------------------

async function checkCollectionLoads(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now()
  const details: string[] = []
  let passed = true

  try {
    // Verify collection table has rows
    const { count, error: countError } = await supabase
      .from('collection')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      details.push(`ERROR querying collection: ${countError.message}`)
      passed = false
    } else if (!count || count === 0) {
      details.push('FAIL — collection table is empty (expected > 0 rows)')
      passed = false
    } else {
      details.push(`Collection has ${count} rows`)
    }

    // Verify we can query with filters (simulates collection page load)
    const { data: sampleCards, error: sampleError } = await supabase
      .from('collection')
      .select('card_name, quantity, set_code, color_identity')
      .limit(5)

    if (sampleError) {
      details.push(`ERROR fetching sample cards: ${sampleError.message}`)
      passed = false
    } else if (!sampleCards || sampleCards.length === 0) {
      details.push('FAIL — could not fetch sample collection rows')
      passed = false
    } else {
      details.push(`Sample query returned ${sampleCards.length} cards`)
      details.push(`  First card: "${sampleCards[0].card_name}" (${sampleCards[0].set_code})`)
    }

    // Verify aggregation query works (simulates collection stats)
    const { count: uniqueCount, error: uniqueError } = await supabase
      .from('collection')
      .select('card_name', { count: 'exact', head: true })

    if (uniqueError) {
      details.push(`ERROR on stats query: ${uniqueError.message}`)
      passed = false
    } else {
      details.push(`Total collection entries: ${uniqueCount}`)
    }
  } catch (err) {
    details.push(`UNEXPECTED ERROR: ${err instanceof Error ? err.message : String(err)}`)
    passed = false
  }

  return { name: 'Collection Data Loads', passed, details, duration: Date.now() - start }
}

// ---------------------------------------------------------------------------
// Check 2: Deck Lists Display
// ---------------------------------------------------------------------------

async function checkDeckLists(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now()
  const details: string[] = []
  let passed = true

  try {
    // Verify decks table has rows
    const { data: decks, error: decksError } = await supabase
      .from('decks')
      .select('id, name, commander_name, colour_identity, card_count, status')
      .order('name')

    if (decksError) {
      details.push(`ERROR querying decks: ${decksError.message}`)
      passed = false
    } else if (!decks || decks.length === 0) {
      details.push('FAIL — decks table is empty (expected user decks)')
      passed = false
    } else {
      details.push(`Found ${decks.length} decks:`)
      for (const deck of decks.slice(0, 10)) {
        details.push(`  • ${deck.name} (${deck.commander_name ?? 'no commander'}) [${deck.status}]`)
      }
      if (decks.length > 10) {
        details.push(`  ... and ${decks.length - 10} more`)
      }
    }

    // Verify deck_cards loads for at least one deck
    if (decks && decks.length > 0) {
      const testDeckId = decks[0].id
      const { data: deckCards, error: cardsError } = await supabase
        .from('deck_cards')
        .select('card_name, quantity, categories, is_commander')
        .eq('deck_id', testDeckId)
        .limit(10)

      if (cardsError) {
        details.push(`ERROR loading cards for deck ${testDeckId}: ${cardsError.message}`)
        passed = false
      } else if (!deckCards || deckCards.length === 0) {
        details.push(`WARNING — deck "${decks[0].name}" has no cards in deck_cards`)
      } else {
        const commanders = deckCards.filter(c => c.is_commander)
        details.push(`Deck "${decks[0].name}": ${deckCards.length}+ cards loaded, ${commanders.length} commander(s)`)
      }
    }

    // Verify deck with related data (documentation, health, strategy)
    if (decks && decks.length > 0) {
      const testDeckId = decks[0].id
      const { data: doc } = await supabase
        .from('deck_documentation')
        .select('deck_id')
        .eq('deck_id', testDeckId)
        .maybeSingle()

      const { data: health } = await supabase
        .from('deck_health')
        .select('deck_id, overall_status')
        .eq('deck_id', testDeckId)
        .maybeSingle()

      details.push(`Deck relations: documentation=${doc ? 'exists' : 'none'}, health=${health ? health.overall_status : 'none'}`)
    }
  } catch (err) {
    details.push(`UNEXPECTED ERROR: ${err instanceof Error ? err.message : String(err)}`)
    passed = false
  }

  return { name: 'Deck Lists Display', passed, details, duration: Date.now() - start }
}

// ---------------------------------------------------------------------------
// Check 3: Price Cache Queries
// ---------------------------------------------------------------------------

async function checkPriceCache(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now()
  const details: string[] = []
  let passed = true

  try {
    // Verify card_kingdom_prices has entries
    const { count, error: countError } = await supabase
      .from('card_kingdom_prices')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      details.push(`ERROR querying card_kingdom_prices: ${countError.message}`)
      passed = false
    } else if (!count || count === 0) {
      details.push('FAIL — card_kingdom_prices table is empty (expected cached prices)')
      passed = false
    } else {
      details.push(`Price cache has ${count} entries`)
    }

    // Verify we can query prices with a filter
    const { data: samplePrices, error: sampleError } = await supabase
      .from('card_kingdom_prices')
      .select('scryfall_printing_id, price_retail, is_foil, updated_at')
      .limit(5)

    if (sampleError) {
      details.push(`ERROR fetching sample prices: ${sampleError.message}`)
      passed = false
    } else if (!samplePrices || samplePrices.length === 0) {
      details.push('FAIL — could not fetch sample price rows')
      passed = false
    } else {
      details.push(`Sample prices:`)
      for (const p of samplePrices.slice(0, 3)) {
        details.push(`  • ${p.scryfall_printing_id}: $${p.price_retail} (foil=${p.is_foil})`)
      }
    }

    // Verify the oracle_to_printings lookup works (used in price resolution)
    const { count: oracleCount, error: oracleError } = await supabase
      .from('oracle_to_printings')
      .select('*', { count: 'exact', head: true })

    if (oracleError) {
      details.push(`ERROR querying oracle_to_printings: ${oracleError.message}`)
      passed = false
    } else {
      details.push(`Oracle-to-printings mapping: ${oracleCount} entries`)
    }

    // Verify a price lookup join works (card_definitions → oracle_to_printings → card_kingdom_prices)
    const { data: priceLookup, error: lookupError } = await supabase
      .from('card_definitions')
      .select('card_name, oracle_id')
      .limit(1)
      .single()

    if (!lookupError && priceLookup) {
      const { data: printings } = await supabase
        .from('oracle_to_printings')
        .select('scryfall_printing_id')
        .eq('oracle_id', priceLookup.oracle_id)
        .limit(5)

      if (printings && printings.length > 0) {
        const printingIds = printings.map(p => p.scryfall_printing_id)
        const { data: prices } = await supabase
          .from('card_kingdom_prices')
          .select('price_retail')
          .in('scryfall_printing_id', printingIds)
          .limit(1)

        if (prices && prices.length > 0) {
          details.push(`Price lookup chain works: "${priceLookup.card_name}" → $${prices[0].price_retail}`)
        } else {
          details.push(`Price lookup chain: "${priceLookup.card_name}" has no CK price (OK — not all cards priced)`)
        }
      }
    }
  } catch (err) {
    details.push(`UNEXPECTED ERROR: ${err instanceof Error ? err.message : String(err)}`)
    passed = false
  }

  return { name: 'Price Cache Queries', passed, details, duration: Date.now() - start }
}

// ---------------------------------------------------------------------------
// Check 4: CRUD Operations
// ---------------------------------------------------------------------------

async function checkCrudOperations(supabase: SupabaseClient): Promise<CheckResult> {
  const start = Date.now()
  const details: string[] = []
  let passed = true

  // Use deck_notes as the CRUD test table — it's user-owned, has an auto-generated ID,
  // and won't collide with real data as long as we use a recognizable test marker.
  // We need a valid deck_id to satisfy the FK constraint.

  const TEST_CONTENT = '__E2E_VERIFICATION_TEST_NOTE__'
  let testNoteId: number | null = null
  let testDeckId: number | null = null
  let testUserId: string | null = null

  try {
    // Find a valid deck_id and user_id to use for the test
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, user_id')
      .limit(1)
      .single()

    if (deckError || !deck) {
      details.push(`ERROR finding test deck: ${deckError?.message ?? 'no decks found'}`)
      details.push('Cannot run CRUD test without at least one deck in the database')
      passed = false
      return { name: 'CRUD Operations', passed, details, duration: Date.now() - start }
    }

    testDeckId = deck.id
    testUserId = deck.user_id
    details.push(`Using deck_id=${testDeckId} for CRUD test`)

    // --- CREATE ---
    const { data: insertedNote, error: insertError } = await supabase
      .from('deck_notes')
      .insert({
        deck_id: testDeckId,
        content: TEST_CONTENT,
        user_id: testUserId,
      })
      .select('id, deck_id, content, user_id, created_at')
      .single()

    if (insertError || !insertedNote) {
      details.push(`CREATE FAILED: ${insertError?.message ?? 'no data returned'}`)
      passed = false
      return { name: 'CRUD Operations', passed, details, duration: Date.now() - start }
    }

    testNoteId = insertedNote.id
    details.push(`CREATE: ✅ Inserted note id=${testNoteId}`)

    // --- READ ---
    const { data: readNote, error: readError } = await supabase
      .from('deck_notes')
      .select('id, deck_id, content, user_id, created_at')
      .eq('id', testNoteId)
      .single()

    if (readError || !readNote) {
      details.push(`READ FAILED: ${readError?.message ?? 'note not found'}`)
      passed = false
    } else if (readNote.content !== TEST_CONTENT) {
      details.push(`READ FAILED: content mismatch — expected "${TEST_CONTENT}", got "${readNote.content}"`)
      passed = false
    } else if (readNote.deck_id !== testDeckId) {
      details.push(`READ FAILED: deck_id mismatch — expected ${testDeckId}, got ${readNote.deck_id}`)
      passed = false
    } else {
      details.push(`READ:   ✅ Retrieved note id=${testNoteId}, content matches`)
    }

    // --- UPDATE ---
    const UPDATED_CONTENT = `${TEST_CONTENT}_UPDATED`
    const { data: updatedNote, error: updateError } = await supabase
      .from('deck_notes')
      .update({ content: UPDATED_CONTENT })
      .eq('id', testNoteId)
      .select('id, content')
      .single()

    if (updateError || !updatedNote) {
      details.push(`UPDATE FAILED: ${updateError?.message ?? 'no data returned'}`)
      passed = false
    } else if (updatedNote.content !== UPDATED_CONTENT) {
      details.push(`UPDATE FAILED: content not updated — got "${updatedNote.content}"`)
      passed = false
    } else {
      details.push(`UPDATE: ✅ Updated note id=${testNoteId}, content verified`)
    }

    // --- DELETE ---
    const { error: deleteError } = await supabase
      .from('deck_notes')
      .delete()
      .eq('id', testNoteId)

    if (deleteError) {
      details.push(`DELETE FAILED: ${deleteError.message}`)
      passed = false
    } else {
      // Verify deletion
      const { data: deletedNote } = await supabase
        .from('deck_notes')
        .select('id')
        .eq('id', testNoteId)
        .maybeSingle()

      if (deletedNote) {
        details.push(`DELETE FAILED: note id=${testNoteId} still exists after delete`)
        passed = false
      } else {
        details.push(`DELETE: ✅ Deleted note id=${testNoteId}, verified gone`)
        testNoteId = null // Mark as cleaned up
      }
    }
  } catch (err) {
    details.push(`UNEXPECTED ERROR: ${err instanceof Error ? err.message : String(err)}`)
    passed = false
  } finally {
    // Safety cleanup — if the test note wasn't deleted, try to remove it
    if (testNoteId !== null) {
      try {
        await supabase.from('deck_notes').delete().eq('id', testNoteId)
        details.push(`CLEANUP: Removed leftover test note id=${testNoteId}`)
      } catch {
        details.push(`CLEANUP WARNING: Could not remove test note id=${testNoteId}`)
      }
    }
  }

  return { name: 'CRUD Operations', passed, details, duration: Date.now() - start }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log()
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   End-to-End Verification — The Oracle × Supabase      ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()
  console.log('Validates: Requirement 9.1 — End-to-end verification')
  console.log()

  // --- Validate environment ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable.')
    console.error('   Set it in .env.local or export it before running this script.')
    process.exit(1)
  }
  if (!serviceRoleKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable.')
    console.error('   Set it in .env.local or export it before running this script.')
    process.exit(1)
  }

  console.log(`🔗 Supabase URL: ${supabaseUrl}`)
  console.log()

  // --- Create Supabase client ---
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // --- Quick connectivity check ---
  const { error: pingError } = await supabase.from('decks').select('id', { count: 'exact', head: true })
  if (pingError) {
    console.error(`❌ Cannot connect to Supabase: ${pingError.message}`)
    console.error('   Verify your NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct.')
    process.exit(1)
  }
  console.log('🟢 Connected to Supabase successfully')

  // --- Run all E2E checks ---
  const results: CheckResult[] = []

  printHeader('Check 1: Collection Data Loads')
  const collectionResult = await checkCollectionLoads(supabase)
  results.push(collectionResult)
  printResult(collectionResult)

  printHeader('Check 2: Deck Lists Display')
  const decksResult = await checkDeckLists(supabase)
  results.push(decksResult)
  printResult(decksResult)

  printHeader('Check 3: Price Cache Queries')
  const priceResult = await checkPriceCache(supabase)
  results.push(priceResult)
  printResult(priceResult)

  printHeader('Check 4: CRUD Operations')
  const crudResult = await checkCrudOperations(supabase)
  results.push(crudResult)
  printResult(crudResult)

  // --- Summary ---
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║   RESULTS SUMMARY                                      ║')
  console.log('╠══════════════════════════════════════════════════════════╣')

  const allPassed = results.every(r => r.passed)
  const passCount = results.filter(r => r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌'
    console.log(`║  ${icon} ${r.name.padEnd(40)} ${formatDuration(r.duration).padStart(8)} ║`)
  }

  console.log('╠══════════════════════════════════════════════════════════╣')

  if (allPassed) {
    console.log(`║  ✅ ALL CHECKS PASSED (${passCount}/${results.length})${' '.repeat(25)}║`)
    console.log(`║  Total time: ${formatDuration(totalDuration).padEnd(39)}║`)
    console.log('║                                                          ║')
    console.log('║  The application is verified working against Supabase.   ║')
  } else {
    const failCount = results.filter(r => !r.passed).length
    console.log(`║  ❌ ${failCount} CHECK(S) FAILED                                   ║`)
    console.log(`║  Total time: ${formatDuration(totalDuration).padEnd(39)}║`)
    console.log('║                                                          ║')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`║  • ${r.name.padEnd(50)}║`)
    }
  }

  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log()

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
