import { NextRequest, NextResponse } from 'next/server'
import { executeInstanceLevelImport, type ImportProgress } from '@/lib/import-engine-v2'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 120

function ndjsonLine(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`)
}

function streamReplaceImport(csvContent: string, userId: string): Response {
  let streamClosed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        if (streamClosed) return
        try {
          controller.enqueue(ndjsonLine(event))
        } catch {
          streamClosed = true
        }
      }

      void executeInstanceLevelImport({
        csvContent,
        mode: 'replace',
        userId,
        onProgress: async (progress: ImportProgress) => {
          send({ type: 'progress', ...progress })
        },
      })
        .then((summary) => {
          send({ type: 'complete', summary: { ...summary, replaced: true } })
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          send({
            type: 'error',
            message,
            isCsvParseError: isCsvParseError(err),
          })
        })
        .finally(() => {
          if (!streamClosed) {
            streamClosed = true
            try {
              controller.close()
            } catch {
              // The client may have cancelled the request while the import was running.
            }
          }
        })
    },
    cancel() {
      streamClosed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}

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
  // Mode: replace — parse and reconcile the complete collection atomically.
  // The RPC removes existing copies and inserts the resolved rows in one
  // transaction; the route never deletes live data before import succeeds.
  // ---------------------------------------------------------------------------
  if (mode === 'replace') {
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

    return streamReplaceImport(csvContent, userId)
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
      const summary = await executeInstanceLevelImport({
        csvContent,
        mode: 'add',
        userId,
      })
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

  // The retired DELETE+INSERT path is intentionally unavailable. Use the
  // current-schema add, sync, or replace modes above.
  return Response.json(
    { error: 'Unsupported import mode. Use mode=add, mode=sync, or mode=replace.' },
    { status: 410 }
  )
}
