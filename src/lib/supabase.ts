import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * Creates a session-aware Supabase client for server components and API routes.
 * Uses the anon key with cookie-based session handling — RLS is enforced.
 * Use this when you need the authenticated user's session context.
 */
export async function createAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL environment variable. ' +
        'Set it in .env.local to your Supabase project URL.'
    )
  }
  if (!key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. ' +
        'Set it in .env.local to your Supabase anon key.'
    )
  }

  const cookieStore = await cookies()
  return createSupabaseServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      },
    },
  })
}

/**
 * Creates a Supabase client for trusted server-side operations (sync, migration).
 * Uses the service role key which bypasses RLS — only use in trusted server contexts.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL environment variable. ' +
        'Set it in .env.local to your Supabase project URL.'
    )
  }
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
        'Set it in .env.local to your Supabase service role key.'
    )
  }

  return createClient<Database>(url, key)
}

/**
 * @deprecated Use `createAdminClient()` instead. This alias exists for backward compatibility.
 */
export const createServerClient = createAdminClient

/**
 * Creates a Supabase client for browser/client-side use (React components via TanStack Query).
 * Uses the anon key which respects RLS policies.
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL environment variable. ' +
        'Set it in .env.local to your Supabase project URL.'
    )
  }
  if (!key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. ' +
        'Set it in .env.local to your Supabase anon key.'
    )
  }

  return createClient<Database>(url, key)
}
