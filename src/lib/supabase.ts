import { createClient } from '@supabase/supabase-js'
import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

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
 * Uses @supabase/ssr to store session tokens in cookies — making them visible to the
 * Next.js middleware for server-side auth checks and redirects.
 */
let browserClient: ReturnType<typeof createSupabaseBrowserClient<Database>> | null = null

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

  if (!browserClient) {
    browserClient = createSupabaseBrowserClient<Database>(url, key)
  }

  return browserClient
}
