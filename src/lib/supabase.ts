import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Creates a Supabase client for server-side use (API routes, server components).
 * Uses the service role key which bypasses RLS — only use in trusted server contexts.
 */
export function createServerClient() {
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
