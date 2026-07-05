#!/usr/bin/env npx tsx
/**
 * Standalone script to run the collection import engine against Supabase.
 * 
 * This bypasses the HTTP timeout by running directly in Node.js.
 * 
 * Usage: npx tsx scripts/run-collection-import.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local before any other imports
config({ path: resolve(__dirname, '..', '.env.local') })

async function main() {
  // Dynamic import after env is loaded
  const { executeCollectionImport } = await import('../src/lib/import-engine')
  const { readFileSync } = await import('fs')

  const csvPath = resolve(__dirname, '..', 'data', 'collection.csv')
  console.log(`[import] Reading CSV from: ${csvPath}`)

  const csvContent = readFileSync(csvPath, 'utf-8')
  const lineCount = csvContent.split('\n').filter(l => l.trim()).length - 1
  console.log(`[import] CSV contains ${lineCount} data rows`)

  console.log('[import] Starting import engine (this may take a few minutes)...')
  const startTime = Date.now()

  try {
    const summary = await executeCollectionImport({ csvInput: csvContent })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n[import] ✅ Import complete in ${elapsed}s`)
    console.log(`  Created:          ${summary.created}`)
    console.log(`  Updated quantity: ${summary.updatedQuantity}`)
    console.log(`  Updated condition:${summary.updatedCondition}`)
    console.log(`  Unchanged:        ${summary.unchanged}`)
    console.log(`  Soft-deleted:     ${summary.softDeleted}`)
    console.log(`  Unmatched:        ${summary.unmatched}`)
    console.log(`  Total CSV rows:   ${summary.totalCsvRows}`)
    console.log(`  Total writes:     ${summary.totalWriteCount}`)

    if (summary.batchErrors.length > 0) {
      console.log(`\n  ⚠️  Batch errors (${summary.batchErrors.length}):`)
      for (const err of summary.batchErrors) {
        console.log(`    - ${err}`)
      }
    }

    if (summary.unmatchedRows.length > 0) {
      console.log(`\n  ⚠️  Unmatched rows (${summary.unmatchedRows.length}):`)
      for (const row of summary.unmatchedRows.slice(0, 10)) {
        console.log(`    - Row ${row.rowIndex}: ${row.cardName} (${row.editionCode}) — ${row.reason}`)
      }
      if (summary.unmatchedRows.length > 10) {
        console.log(`    ... and ${summary.unmatchedRows.length - 10} more`)
      }
    }
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`\n[import] ❌ Import failed after ${elapsed}s:`, err)
    process.exit(1)
  }
}

main()
