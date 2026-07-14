import { NextRequest, NextResponse } from 'next/server'
import {
  parseCollectionCSV,
  computeCollectionDelta,
  applyCollectionImport,
} from '@/lib/csv-import'
import { importCollectionAndReallocate } from '@/lib/collection-reallocator'
import { executeCollectionImportAsync } from '@/lib/import-engine'
import { executeInstanceLevelImport } from '@/lib/import-engine-v2'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * Determines if an error is a CSV parse error (invalid format, missing columns, etc.).
 */
function isCsvParseError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes('CSV is empty') ||
      err.message.includes('CSV missing required columns')
    )
  }
  return false
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('mode') || 'upsert'

  // ---------------------------------------------------------------------------
  // Mode: replace — Wipe all physical_copies for user, then add from CSV
  // Use when you want the CSV to become the complete authoritative collection.
  // ---------------------------------------------------------------------------
  if (mode === 'replace') {
    const supabase = createAdminClient()

    // Read CSV body
    let csvContent: string
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && file instanceof Blob) {
        csvContent = await file.text()
      } else {
        return NextResponse.json({ error: 'No CSV file provided' }, { status: 400 })
      }
    } else {
      try {
        csvContent = await request.text()
        if (!csvContent.trim()) {
          return NextResponse.json({ error: 'No CSV content provided' }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ error: 'No CSV content provided' }, { status: 400 })
      }
    }

    // Delete all existing physical_copies for this user
    const { error: deleteErr } = await supabase
      .from('physical_copies')
      .delete()
      .eq('user_id', userId)

    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to clear collection: ${deleteErr.message}` },
        { status: 500 }
      )
    }

    // Also clear the collection lookup table (set metadata cache)
    await supabase.from('collection').delete().eq('user_id', userId).then(() => {}, () => {})

    // Now run as 'add' mode (pure append into empty table)
    try {
      const summary = await executeInstanceLevelImport({
        csvContent,
        mode: 'add',
        userId,
      })

      // [Phase 4] Collection changes no longer trigger allocation.
      // If a collection edit invalidates an existing link, it surfaces as a
      // completeness drop (Section 5) on the affected deck's picklist.
      // See spec Section 6f: "Retire, no replacement."

      return NextResponse.json({ ...summary, replaced: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `Replace import failed: ${message}` }, { status: 500 })
    }
  }

  // ---------------------------------------------------------------------------
  // Mode: add — Instance-level import, pure append (one row per physical card)
  // ---------------------------------------------------------------------------
  if (mode === 'add' || mode === 'sync') {
    let csvContent: string

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && file instanceof Blob) {
        csvContent = await file.text()
      } else {
        return NextResponse.json(
          { error: 'No CSV file provided in multipart form data' },
          { status: 400 }
        )
      }
    } else if (contentType.includes('text/') || contentType.includes('application/octet-stream')) {
      csvContent = await request.text()
    } else {
      try {
        const body = await request.text()
        if (body.trim()) {
          csvContent = body
        } else {
          return NextResponse.json(
            { error: 'No CSV content provided in request body' },
            { status: 400 }
          )
        }
      } catch {
        return NextResponse.json(
          { error: 'No CSV content provided in request body' },
          { status: 400 }
        )
      }
    }

    try {
      const summary = await executeInstanceLevelImport({
        csvContent,
        mode: mode as 'add' | 'sync',
        userId,
      })

      // [Phase 4] Collection changes no longer trigger allocation.
      // If a collection edit invalidates an existing link, it surfaces as a
      // completeness drop (Section 5) on the affected deck's picklist.
      // See spec Section 6f: "Retire, no replacement."

      return NextResponse.json(summary)
    } catch (err) {
      if (isCsvParseError(err)) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'CSV parse error' },
          { status: 400 }
        )
      }
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: `Import failed: ${message}` },
        { status: 500 }
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Mode: upsert — Import Engine writing to physical_copies via Supabase
  // (legacy v1 instance mode — kept for backward compatibility)
  // ---------------------------------------------------------------------------
  if (mode === 'upsert') {
    // Read CSV from request body (text, multipart, or raw)
    let csvContent: string

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && file instanceof Blob) {
        csvContent = await file.text()
      } else {
        return NextResponse.json(
          { error: 'No CSV file provided in multipart form data' },
          { status: 400 }
        )
      }
    } else if (contentType.includes('text/') || contentType.includes('application/octet-stream')) {
      csvContent = await request.text()
    } else {
      // Default: try reading body as text
      try {
        const body = await request.text()
        if (body.trim()) {
          csvContent = body
        } else {
          return NextResponse.json(
            { error: 'No CSV content provided in request body' },
            { status: 400 }
          )
        }
      } catch {
        return NextResponse.json(
          { error: 'No CSV content provided in request body' },
          { status: 400 }
        )
      }
    }

    try {
      const summary = await executeCollectionImportAsync({ csvInput: csvContent })
      return NextResponse.json(summary)
    } catch (err) {
      if (isCsvParseError(err)) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'CSV parse error' },
          { status: 400 }
        )
      }
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: `Import failed: ${message}` },
        { status: 500 }
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Mode: legacy — existing DELETE+INSERT behavior (writes to collection table)
  // Gated: requires confirm_delete=true to proceed (Requirement 3)
  // ---------------------------------------------------------------------------

  const confirmDelete = searchParams.get('confirm_delete')

  if (confirmDelete !== 'true') {
    const message = confirmDelete === null
      ? 'Legacy destructive import path is disabled. To proceed with the DELETE-ALL operation, include confirm_delete=true as a query parameter.'
      : `Legacy destructive import path rejected: confirm_delete must be exactly 'true', received '${confirmDelete}'.`

    return Response.json(
      { error: message },
      { status: 403 }
    )
  }

  // Read CSV from request body
  let csvContent: string
  try {
    const body = await request.text()
    if (!body.trim()) {
      return Response.json(
        { error: 'No CSV content provided in request body' },
        { status: 400 }
      )
    }
    csvContent = body
  } catch {
    return Response.json(
      { error: 'No CSV content provided in request body' },
      { status: 400 }
    )
  }

  const rows = parseCollectionCSV(csvContent)

  const apply = searchParams.get('apply') === 'true'
  const reallocate = searchParams.get('reallocate') === 'true'
  const chunkIndex = parseInt(searchParams.get('chunk_index') || '0', 10)

  // Only compute delta for the first chunk (or when not applying)
  const delta = chunkIndex === 0 ? await computeCollectionDelta(rows) : null

  if (apply) {
    // If reallocate=true, use the full import+reallocation flow
    if (reallocate) {
      try {
        const result = await importCollectionAndReallocate(csvContent, userId)
        const response = Response.json({
          delta: result.importDelta,
          applied: true,
          reallocated: true,
          entryCount: result.importDelta.totalEntries,
          allocationChanges: {
            added: result.allocationChanges.added.length,
            removed: result.allocationChanges.removed.length,
            originalToProxy: result.allocationChanges.originalToProxy.length,
            proxyToOriginal: result.allocationChanges.proxyToOriginal.length,
            unchanged: result.allocationChanges.unchanged.length,
          },
          newlyFulfilled: result.newlyFulfilled,
          newlyBroken: result.newlyBroken,
        })
        response.headers.set('X-Import-Warning', 'Destructive legacy import performed: existing collection data was deleted before re-import.')
        return response
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return Response.json(
          { error: `Reallocation failed: ${message}` },
          { status: 500 }
        )
      }
    }

    // Standard import without reallocation
    const importResult = await applyCollectionImport(rows, { skipDelete: chunkIndex > 0, userId })
    const response = Response.json({
      delta,
      applied: true,
      reallocated: false,
      entryCount: importResult.totalInserted,
      errors: importResult.errors.length > 0 ? importResult.errors : undefined,
    })
    response.headers.set('X-Import-Warning', 'Destructive legacy import performed: existing collection data was deleted before re-import.')
    return response
  }

  const response = Response.json({ delta, applied: false })
  response.headers.set('X-Import-Warning', 'Destructive legacy import performed: existing collection data was deleted before re-import.')
  return response
}
