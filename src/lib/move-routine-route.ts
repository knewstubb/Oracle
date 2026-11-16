/**
 * Runs one Picklist stored routine for a route handler. The routine is callable by the server only; the caller passes
 * the signed-in user's id as `p_user_id`. A refusal becomes a plain answer with the right status; nothing is saved.
 */
import { createAdminClient } from '@/lib/supabase'
import { codeFromMoveError, moveErrorMessage, moveErrorStatus } from '@/lib/move-routines'

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>

export async function runMoveRoutine(
  fn: string,
  args: Record<string, unknown>,
  cardName: string,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  const supabase = createAdminClient()
  // The routines are new and not in the generated types yet.
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc
  try {
    const { data, error } = await rpc(fn, args)
    if (error) {
      const code = codeFromMoveError(error.message)
      if (code === 'failed') console.error(`[${fn}]`, error.message)
      return { ok: false, response: Response.json({ error: code, message: moveErrorMessage(code, cardName) }, { status: moveErrorStatus(code) }) }
    }
    return { ok: true, data }
  } catch (err) {
    console.error(`[${fn}]`, err)
    return { ok: false, response: Response.json({ error: 'failed', message: moveErrorMessage('failed', cardName) }, { status: 500 }) }
  }
}

export function badRequest(message: string): Response {
  return Response.json({ error: 'bad_request', message }, { status: 400 })
}

export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
