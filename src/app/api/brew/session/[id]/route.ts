// ---------------------------------------------------------------------------
// PATCH /api/brew/session/[id] — Batch-update session fields (autosave)
// ---------------------------------------------------------------------------
// Accepts a partial body of only-dirty fields and persists them atomically.
// For skeleton_json, performs a read-merge-write to preserve sibling fields
// not present in the payload.
//
// Validates: Requirements 4.3, 6.2
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { getBrewSession, updateBrewSession } from '@/lib/brew-v2-session'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatchSessionBody {
  conversation_json?: string
  decision_log_json?: string
  skeleton_json?: string
  status?: string
  commander_name?: string | null
  colour_identity?: string | null
  path_type?: string | null
}

const ALLOWED_FIELDS: (keyof PatchSessionBody)[] = [
  'conversation_json',
  'decision_log_json',
  'skeleton_json',
  'status',
  'commander_name',
  'colour_identity',
  'path_type',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep-merges only the top-level keys present in `patch` into `existing`.
 * This preserves sibling fields in skeleton_json that weren't sent in the
 * request (e.g., updating canvasPositions without clobbering cards).
 */
function mergeSkeletonJson(
  existingJson: string | null,
  patchJson: string
): string {
  let existing: Record<string, unknown> = {}
  if (existingJson) {
    try {
      existing = JSON.parse(existingJson) as Record<string, unknown>
    } catch {
      existing = {}
    }
  }

  let patch: Record<string, unknown> = {}
  try {
    patch = JSON.parse(patchJson) as Record<string, unknown>
  } catch {
    // If the patch itself is invalid JSON, just store it as-is
    return patchJson
  }

  // Merge only keys present in the patch into existing
  const merged = { ...existing, ...patch }
  return JSON.stringify(merged)
}

// ---------------------------------------------------------------------------
// PATCH handler
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- Validate path param ---
    const { id } = await params
    const sessionId = parseInt(id, 10)

    if (isNaN(sessionId) || sessionId <= 0) {
      return Response.json(
        { error: 'Invalid session ID — must be a positive integer' },
        { status: 400 }
      )
    }

    // --- Parse and validate body ---
    let body: PatchSessionBody
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Filter to only allowed fields that are actually present
    const fieldsToUpdate: Partial<PatchSessionBody> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(fieldsToUpdate as any)[key] = (body as any)[key]
      }
    }

    // Reject empty body (no fields to update)
    if (Object.keys(fieldsToUpdate).length === 0) {
      return Response.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // --- Verify session exists ---
    const session = await getBrewSession(sessionId)
    if (!session) {
      return Response.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // --- Handle skeleton_json read-merge-write ---
    const updatePayload: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      if (key === 'skeleton_json' && typeof value === 'string') {
        // Read-merge-write: preserve sibling fields not in the patch
        updatePayload.skeleton_json = mergeSkeletonJson(
          session.skeleton_json,
          value
        )
      } else {
        updatePayload[key] = value
      }
    }

    // --- Persist ---
    const updatedAt = new Date().toISOString()
    await updateBrewSession(sessionId, {
      ...updatePayload,
      updated_at: updatedAt,
    })

    return Response.json({ success: true, updated_at: updatedAt })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[brew/session/PATCH] Error: ${message}`)
    return Response.json(
      { error: `Failed to update session: ${message}` },
      { status: 500 }
    )
  }
}
