import type { User } from '@supabase/supabase-js'
import { createAuthServerClient } from './supabase'

/**
 * Retrieves the authenticated user from the current session.
 * Returns the User object if authenticated, or null if no valid session exists.
 */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createAuthServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * Requires authentication for an API route.
 * Returns the authenticated User if a valid session exists,
 * or a 401 Response if no valid session is found.
 *
 * Callers must check `instanceof Response` to distinguish between the two return types.
 */
export async function requireAuth(): Promise<User | Response> {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return user
}
