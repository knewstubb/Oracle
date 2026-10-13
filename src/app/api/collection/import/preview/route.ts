/**
 * POST /api/collection/import/preview
 *
 * Non-writing ManaBox collection preview (contract §13.1). Parses a ManaBox
 * CSV, resolves identities, detects tokens and unmatched rows, and returns the
 * combined review rows. No `user_cards`, `user_copies` or `deck_cards` rows are
 * created.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { buildCollectionPreview } from '@/lib/manabox-import'
import { createSupabaseManaBoxResolver } from '@/lib/manabox-resolver'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let csvContent = ''
  let fileName = 'collection.csv'

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof Blob)) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }
    csvContent = await file.text()
    if (file instanceof File) fileName = file.name
  } else {
    try {
      const body = (await request.json()) as { csvContent?: string; fileName?: string }
      csvContent = body.csvContent ?? ''
      if (body.fileName) fileName = body.fileName
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }
  }

  if (!csvContent.trim()) {
    return Response.json({ error: 'No CSV content provided' }, { status: 400 })
  }

  try {
    const preview = await buildCollectionPreview(
      { fileName, csvContent },
      createSupabaseManaBoxResolver()
    )
    return Response.json(preview)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Could not check this file: ${message}` }, { status: 400 })
  }
}
