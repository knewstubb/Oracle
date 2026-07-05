import { NextRequest, NextResponse } from 'next/server'
import {
  parseCollectionCSV,
  computeCollectionDelta,
  applyCollectionImport,
} from '@/lib/csv-import'
import { importCollectionAndReallocate } from '@/lib/sync-engine'
import { executeCollectionImportAsync } from '@/lib/import-engine'
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
  // Mode: upsert — Import Engine writing to physical_copies via Supabase
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
  // ---------------------------------------------------------------------------

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
        return Response.json({
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return Response.json(
          { error: `Reallocation failed: ${message}` },
          { status: 500 }
        )
      }
    }

    // Standard import without reallocation
    const importResult = await applyCollectionImport(rows, { skipDelete: chunkIndex > 0 })
    return Response.json({
      delta,
      applied: true,
      reallocated: false,
      entryCount: importResult.totalInserted,
    })
  }

  return Response.json({ delta, applied: false })
}
