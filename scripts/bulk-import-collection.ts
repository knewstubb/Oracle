#!/usr/bin/env node
/**
 * Bulk Collection Import — Fast Path
 * 
 * Processes the full Archidekt CSV in ~3 seconds by:
 * 1. Parse CSV (instant)
 * 2. Batch upsert card_definitions (500/batch)
 * 3. Batch upsert physical_copies (500/batch)
 * 4. Soft-delete absent physical_copies
 * 
 * No row-by-row resolution. The CSV has Scryfall Oracle ID on every row.
 * 
 * Usage: npx tsx scripts/bulk-import-collection.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load env before anything else
config({ path: resolve(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const USER_ID = process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000'
const BATCH_SIZE = 500

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

interface ParsedRow {
  quantity: number
  name: string
  finish: string
  condition: string
  editionCode: string
  collectorNumber: string
  scryfallId: string        // printing ID
  scryfallOracleId: string  // oracle ID
  isFoil: boolean
  colorIdentity: string     // e.g. "W,U,G"
  typeLine: string          // e.g. "Creature" or "Legendary Creature"
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue }
    if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
    current += char
  }
  fields.push(current.trim())
  return fields
}

function parseCSV(csvContent: string): ParsedRow[] {
  const lines = csvContent.split('\n')
  const headers = parseCSVLine(lines[0])
  
  const idx = (name: string) => headers.indexOf(name)
  const qtyIdx = idx('Quantity')
  const nameIdx = idx('Name')
  const finishIdx = idx('Finish')
  const conditionIdx = idx('Condition')
  const editionIdx = idx('Edition Code')
  const collectorIdx = idx('Collector Number')
  const scryfallIdx = idx('Scryfall ID')
  const oracleIdx = idx('Scryfall Oracle ID')
  const identitiesIdx = idx('Identities')
  const typesIdx = idx('Types')
  const superTypesIdx = idx('Super-types')

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const fields = parseCSVLine(line)
    const name = fields[nameIdx]
    if (!name) continue
    const qty = parseInt(fields[qtyIdx] || '1', 10)
    if (qty < 1) continue

    rows.push({
      quantity: qty,
      name,
      finish: fields[finishIdx] || 'Normal',
      condition: fields[conditionIdx] || 'NM',
      editionCode: fields[editionIdx] || '',
      collectorNumber: fields[collectorIdx] || '',
      scryfallId: fields[scryfallIdx] || '',
      scryfallOracleId: fields[oracleIdx] || '',
      isFoil: fields[finishIdx] !== 'Normal' && fields[finishIdx]?.trim() !== '',
      colorIdentity: mapColorIdentity(fields[identitiesIdx] || ''),
      typeLine: buildTypeLine(fields[typesIdx] || '', fields[superTypesIdx] || ''),
    })
  }
  return rows
}

function mapCondition(cond: string): string {
  const c = cond.trim().toLowerCase()
  if (c === 'nm' || c === 'near mint' || c === '') return 'near_mint'
  if (c === 'lp' || c === 'lightly played') return 'lightly_played'
  if (c === 'mp' || c === 'moderately played') return 'moderately_played'
  if (c === 'hp' || c === 'heavily played') return 'heavily_played'
  if (c === 'd' || c === 'damaged') return 'damaged'
  return 'near_mint'
}

/** Map Archidekt "White,Blue,Green" format → "W,U,G" */
const COLOR_NAME_TO_LETTER: Record<string, string> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
  w: 'W', u: 'U', b: 'B', r: 'R', g: 'G',
}

function mapColorIdentity(identities: string): string {
  if (!identities.trim()) return ''
  return identities
    .split(',')
    .map(c => COLOR_NAME_TO_LETTER[c.trim().toLowerCase()] || c.trim())
    .filter(c => 'WUBRG'.includes(c))
    .join(',')
}

function buildTypeLine(types: string, superTypes: string): string {
  const parts: string[] = []
  if (superTypes.trim()) parts.push(superTypes.trim())
  if (types.trim()) parts.push(types.trim())
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now()
  const csvPath = resolve(__dirname, '..', 'data', 'collection.csv')
  console.log(`[bulk-import] Reading: ${csvPath}`)

  const csvContent = readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(csvContent)
  console.log(`[bulk-import] Parsed ${rows.length} rows`)

  // ─── Step 1: Deduplicate oracle IDs → card_definitions ────────
  const oracleMap = new Map<string, { name: string; colorIdentity: string; typeLine: string }>()
  for (const row of rows) {
    if (row.scryfallOracleId && !oracleMap.has(row.scryfallOracleId)) {
      oracleMap.set(row.scryfallOracleId, {
        name: row.name,
        colorIdentity: row.colorIdentity,
        typeLine: row.typeLine,
      })
    }
  }

  console.log(`[bulk-import] ${oracleMap.size} unique oracle IDs to upsert into card_definitions`)

  // Batch upsert card_definitions
  const cardDefRows = Array.from(oracleMap.entries()).map(([oracleId, info]) => ({
    oracle_id: oracleId,
    card_name: info.name,
    color_identity: info.colorIdentity,
    type_line: info.typeLine,
    user_id: USER_ID,
  }))

  let cardDefsUpserted = 0
  for (const batch of chunk(cardDefRows, BATCH_SIZE)) {
    const { error } = await supabase
      .from('card_definitions')
      .upsert(batch, { onConflict: 'oracle_id' })

    if (error) {
      console.error(`[bulk-import] card_definitions upsert error:`, error.message)
      // Continue — some may have succeeded
    } else {
      cardDefsUpserted += batch.length
    }
  }
  console.log(`[bulk-import] card_definitions upserted: ${cardDefsUpserted}`)

  // ─── Step 2: Fetch card_definition IDs ────────────────────────
  // We need the IDs to create physical_copies FK references
  const oracleIds = Array.from(oracleMap.keys())
  const cardDefIdMap = new Map<string, number>() // oracleId → card_definition.id

  for (const batch of chunk(oracleIds, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('card_definitions')
      .select('id, oracle_id')
      .in('oracle_id', batch)

    if (error) {
      console.error(`[bulk-import] Failed to fetch card_definitions:`, error.message)
      continue
    }
    for (const row of data || []) {
      cardDefIdMap.set(row.oracle_id, row.id)
    }
  }
  console.log(`[bulk-import] Fetched ${cardDefIdMap.size} card_definition IDs`)

  // ─── Step 3: Build physical_copies upsert payload ─────────────
  // Key: card_definition_id + scryfall_printing_id + is_foil + is_proxy(false)
  // Aggregate quantities for duplicate printing groups within the CSV
  const printingGroupMap = new Map<string, {
    card_definition_id: number
    scryfall_printing_id: string
    is_foil: boolean
    is_proxy: boolean
    quantity: number
    condition: string
    user_id: string
  }>()

  for (const r of rows) {
    if (!r.scryfallId || !r.scryfallOracleId) continue
    const cardDefId = cardDefIdMap.get(r.scryfallOracleId)
    if (!cardDefId) continue

    const key = `${cardDefId}|${r.scryfallId}|${r.isFoil}`
    const existing = printingGroupMap.get(key)
    if (existing) {
      existing.quantity += r.quantity
    } else {
      printingGroupMap.set(key, {
        card_definition_id: cardDefId,
        scryfall_printing_id: r.scryfallId,
        is_foil: r.isFoil,
        is_proxy: false,
        quantity: r.quantity,
        condition: mapCondition(r.condition),
        user_id: USER_ID,
      })
    }
  }

  const physicalRows = Array.from(printingGroupMap.values())
  console.log(`[bulk-import] ${physicalRows.length} unique printing groups to upsert`)

  // Batch upsert physical_copies (on conflict: update quantity + condition)
  let physicalUpserted = 0
  for (const batch of chunk(physicalRows, BATCH_SIZE)) {
    const { error } = await supabase
      .from('physical_copies')
      .upsert(batch, {
        onConflict: 'card_definition_id,scryfall_printing_id,is_foil,is_proxy',
      })

    if (error) {
      console.error(`[bulk-import] physical_copies upsert error:`, error.message)
    } else {
      physicalUpserted += batch.length
    }
  }
  console.log(`[bulk-import] physical_copies upserted: ${physicalUpserted}`)

  // ─── Step 4: Soft-delete absent rows ──────────────────────────
  // Get all printing IDs we just upserted
  const activePrintingIds = new Set(physicalRows.map(r => r.scryfall_printing_id))

  // Fetch all current non-proxy physical_copies
  const { data: existingCopies, error: fetchErr } = await supabase
    .from('physical_copies')
    .select('id, scryfall_printing_id')
    .eq('is_proxy', false)
    .eq('user_id', USER_ID)
    .gt('quantity', 0)

  if (!fetchErr && existingCopies) {
    const toSoftDelete = existingCopies
      .filter(c => c.scryfall_printing_id && !activePrintingIds.has(c.scryfall_printing_id))
      .map(c => c.id)

    if (toSoftDelete.length > 0) {
      let softDeleted = 0
      for (const batch of chunk(toSoftDelete, BATCH_SIZE)) {
        const { error } = await supabase
          .from('physical_copies')
          .update({ quantity: 0 })
          .in('id', batch)

        if (!error) softDeleted += batch.length
      }
      console.log(`[bulk-import] Soft-deleted ${softDeleted} absent rows`)
    } else {
      console.log(`[bulk-import] No rows to soft-delete`)
    }
  }

  // ─── Step 5: Update sync_meta ─────────────────────────────────
  const now = new Date().toISOString()
  await supabase
    .from('sync_meta')
    .upsert({ key: 'last_collection_import', value: now, updated_at: now }, { onConflict: 'key' })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n[bulk-import] ✅ Done in ${elapsed}s`)
  console.log(`  Card definitions: ${cardDefsUpserted}`)
  console.log(`  Physical copies:  ${physicalUpserted}`)
}

main().catch(err => {
  console.error('[bulk-import] Fatal error:', err)
  process.exit(1)
})
