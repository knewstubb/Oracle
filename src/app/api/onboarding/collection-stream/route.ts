/**
 * POST /api/onboarding/collection-stream
 *
 * Warm-start Phase 1 with streaming progress: Imports the user's full Archidekt collection.
 * Streams progress updates via Server-Sent Events.
 *
 * Progress events:
 * - { phase: 'fetch', current: N, total: null, message: 'Fetching page N...' }
 * - { phase: 'process', current: N, total: T, message: 'Processing cards...' }
 * - { phase: 'complete', result: CollectionImportResult }
 * - { phase: 'error', error: string }
 */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  fetchCollectionWithProgress,
  type ArchidektCollectionEntry,
} from '@/lib/archidekt-client'

// Allow up to 120s for this function
export const maxDuration = 120

interface ProgressEvent {
  phase: 'fetch' | 'process' | 'complete' | 'error'
  current?: number
  total?: number | null
  message?: string
  result?: {
    totalEntries: number
    userCardsCreated: number
    userCopiesCreated: number
    physicalCopiesCreated: number // Alias for UI compatibility
    errors: string[]
    durationMs: number
  }
  error?: string
}

export async function POST() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const sendProgress = async (event: ProgressEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }

  // Run import in background
  ;(async () => {
    const startTime = Date.now()
    const supabase = createAdminClient()
    const errors: string[] = []

    try {
      // Step 1: Fetch collection from Archidekt with progress
      let entries: ArchidektCollectionEntry[]
      try {
        entries = await fetchCollectionWithProgress(async (pageNum) => {
          await sendProgress({
            phase: 'fetch',
            current: pageNum,
            total: null,
            message: `Fetching page ${pageNum} from Archidekt…`,
          })
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('403')) {
          await sendProgress({
            phase: 'error',
            error: 'Your Archidekt collection is private. Set it to Public in Archidekt settings first, then try again.',
          })
          return
        }
        if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
          await sendProgress({
            phase: 'error',
            error: 'Archidekt is rate limiting requests. Please wait 1-2 minutes and try again.',
          })
          return
        }
        await sendProgress({ phase: 'error', error: `Failed to fetch: ${message}` })
        return
      }

      if (entries.length === 0) {
        await sendProgress({
          phase: 'complete',
          result: {
            totalEntries: 0,
            userCardsCreated: 0,
            userCopiesCreated: 0,
            physicalCopiesCreated: 0,
            errors: ['Collection is empty — no entries found.'],
            durationMs: Date.now() - startTime,
          },
        })
        return
      }

      // Step 2: Group entries by card name
      await sendProgress({
        phase: 'process',
        current: 0,
        total: entries.length,
        message: 'Grouping cards…',
      })

      const cardNameToEntries = new Map<string, ArchidektCollectionEntry[]>()
      for (const entry of entries) {
        const cardName = entry.card.oracleCard.name
        if (!cardName) continue
        const existing = cardNameToEntries.get(cardName)
        if (existing) existing.push(entry)
        else cardNameToEntries.set(cardName, [entry])
      }

      // Step 3: Fetch existing user_cards
      let userCardsCreated = 0
      const cardNameToDefId = new Map<string, number>()
      const PAGE_SIZE = 1000
      let offset = 0

      while (true) {
        const { data: existingDefs, error: fetchErr } = await supabase
          .from('user_cards')
          .select('id, card_name, oracle_id')
          .eq('user_id', userId)
          .range(offset, offset + PAGE_SIZE - 1)

        if (fetchErr) {
          errors.push(`Failed to fetch existing user_cards: ${fetchErr.message}`)
          break
        }
        if (!existingDefs || existingDefs.length === 0) break

        for (const def of existingDefs) {
          cardNameToDefId.set(def.card_name, def.id)
        }

        if (existingDefs.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }

      // Step 4: Create missing user_cards
      const uniqueCardNames = Array.from(cardNameToEntries.keys())
      const missingCards = uniqueCardNames.filter(name => !cardNameToDefId.has(name))
      const BATCH_SIZE = 500

      if (missingCards.length > 0) {
        const totalBatches = Math.ceil(missingCards.length / BATCH_SIZE)
        for (let i = 0; i < missingCards.length; i += BATCH_SIZE) {
          const batchNum = Math.floor(i / BATCH_SIZE) + 1
          await sendProgress({
            phase: 'process',
            current: i,
            total: missingCards.length,
            message: `Creating card records (batch ${batchNum}/${totalBatches})…`,
          })

          const batch = missingCards.slice(i, i + BATCH_SIZE).map(cardName => {
            const firstEntry = cardNameToEntries.get(cardName)![0]
            const oracleId = firstEntry.card.oracleCard.uid || `archidekt-${firstEntry.card.oracleCard.id}`
            return {
              oracle_id: oracleId,
              card_name: cardName,
              user_id: userId,
            }
          })

          const { data: inserted, error: insertErr } = await supabase
            .from('user_cards')
            .upsert(batch, { onConflict: 'oracle_id,user_id' })
            .select('id, card_name')

          if (insertErr) {
            console.error('[collection-stream] user_cards insert error:', insertErr)
            errors.push(`user_cards batch at offset ${i}: ${insertErr.message}`)
          } else {
            for (const row of inserted ?? []) {
              cardNameToDefId.set(row.card_name, row.id)
              userCardsCreated++
            }
          }
        }
      }

      // Step 5: Build user_copies rows
      let userCopiesCreated = 0
      const copyRows: Array<{
        card_id: number
        printing_id: string | null
        finish: string
        is_proxy: boolean
        condition: string
        source_tag: string
        user_id: string
      }> = []

      for (const entry of entries) {
        const cardName = entry.card.oracleCard.name
        if (!cardName) continue
        const defId = cardNameToDefId.get(cardName)
        if (!defId) {
          errors.push(`Skipped "${cardName}": no user_cards id resolved`)
          continue
        }

        const printingId = entry.card.uid || null
        const finish = entry.foil ? 'foil' : 'nonfoil'
        const quantity = Math.min(entry.quantity, 100)

        for (let q = 0; q < quantity; q++) {
          copyRows.push({
            card_id: defId,
            printing_id: printingId,
            finish,
            is_proxy: false,
            condition: 'near_mint',
            source_tag: 'archidekt',
            user_id: userId,
          })
        }
      }

      // Step 6: Insert user_copies in batches
      const totalCopyBatches = Math.ceil(copyRows.length / BATCH_SIZE)
      for (let i = 0; i < copyRows.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        await sendProgress({
          phase: 'process',
          current: i,
          total: copyRows.length,
          message: `Importing copies (batch ${batchNum}/${totalCopyBatches}, ${copyRows.length.toLocaleString()} total)…`,
        })

        const batch = copyRows.slice(i, i + BATCH_SIZE)
        const { error: copyErr } = await supabase
          .from('user_copies')
          .insert(batch as any)

        if (copyErr) {
          console.error('[collection-stream] user_copies insert error:', copyErr)
          errors.push(`user_copies batch at offset ${i}: ${copyErr.message}`)
        } else {
          userCopiesCreated += batch.length
        }
      }

      await sendProgress({
        phase: 'complete',
        result: {
          totalEntries: entries.length,
          userCardsCreated,
          userCopiesCreated,
          physicalCopiesCreated: userCopiesCreated, // Alias for UI compatibility
          errors,
          durationMs: Date.now() - startTime,
        },
      })
      
      console.log('[collection-stream] Complete:', {
        totalEntries: entries.length,
        userCardsCreated,
        userCopiesCreated,
        errorCount: errors.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await sendProgress({ phase: 'error', error: message })
    } finally {
      await writer.close()
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
