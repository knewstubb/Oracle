'use server'

import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase-server'

/**
 * Signs the user out by destroying the session and redirecting to the login page.
 */
export async function logout() {
  const supabase = await createAuthServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
