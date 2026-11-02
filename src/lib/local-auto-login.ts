/**
 * Local-only auto sign-in (opt-in).
 *
 * Active only when NODE_ENV === 'development' AND both server-only env vars
 * LOCAL_AUTO_LOGIN_EMAIL and LOCAL_AUTO_LOGIN_PASSWORD are set. Otherwise
 * behaviour is exactly the normal login flow.
 */

export interface LocalAutoLoginEnv {
  NODE_ENV?: string
  LOCAL_AUTO_LOGIN_EMAIL?: string
  LOCAL_AUTO_LOGIN_PASSWORD?: string
}

export interface LocalAutoLoginCredentials {
  email: string
  password: string
}

interface PasswordSignInClient {
  auth: {
    signInWithPassword: (credentials: LocalAutoLoginCredentials) => Promise<{
      error: { message: string } | null
    }>
  }
}

/** Returns credentials when auto sign-in is active, otherwise null. */
export function getLocalAutoLoginCredentials(
  env: LocalAutoLoginEnv = process.env as LocalAutoLoginEnv
): LocalAutoLoginCredentials | null {
  if (env.NODE_ENV !== 'development') return null
  const email = env.LOCAL_AUTO_LOGIN_EMAIL?.trim()
  const password = env.LOCAL_AUTO_LOGIN_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

/**
 * Attempts the automatic sign-in. Returns true if a session was created
 * (the client's cookie handler will have stored it). Never throws; never
 * logs the password.
 */
export async function attemptLocalAutoLogin(
  supabase: PasswordSignInClient,
  credentials: LocalAutoLoginCredentials
): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signInWithPassword(credentials)
    if (error) {
      console.warn(
        `[local-auto-login] Automatic sign-in failed (${error.message}). Falling back to the normal login screen.`
      )
      return false
    }
    return true
  } catch {
    console.warn(
      '[local-auto-login] Automatic sign-in failed unexpectedly. Falling back to the normal login screen.'
    )
    return false
  }
}
