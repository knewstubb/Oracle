'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase-server'
import { SIGNED_OUT_COOKIE } from '@/lib/local-auto-login'

/**
 * Signs the user out by destroying the session and redirecting to the login page.
 * Also sets a marker cookie so the local-only auto sign-in (dev) does not sign the user straight back in.
 * The login form clears the marker on the next manual sign-in.
 */
export async function logout() {
  const supabase = await createAuthServerClient()
  await supabase.auth.signOut()
  const cookieStore = await cookies()
  cookieStore.set(SIGNED_OUT_COOKIE, '1', { path: '/', httpOnly: false, sameSite: 'lax' })
  redirect('/login')
}
