/**
 * POST /api/onboarding/moxfield/collection
 *
 * Imports a Moxfield collection from a CSV file upload.
 * Uses the existing import-engine-v2 with mode='add' and source_tag='moxfield'.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { executeInstanceLevelImport } from '@/lib/import-engine-v2'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  // Read CSV from multipart form data
  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: 'No CSV file provided' }, { status: 400 })
  }

  const csvContent = await file.text()
  if (!csvContent.trim()) {
    return Response.json({ error: 'CSV file is empty' }, { status: 400 })
  }

  try {
    const summary = await executeInstanceLevelImport({
      csvContent,
      mode: 'add',
      userId,
    })

    return Response.json({
      totalEntries: summary.inserted + summary.skipped,
      physicalCopiesCreated: summary.inserted,
      cardDefinitionsCreated: 0,
      errors: summary.errors,
      durationMs: summary.durationMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[onboarding/moxfield/collection] Import failed:', message)
    return Response.json({ error: `Collection import failed: ${message}` }, { status: 500 })
  }
}
