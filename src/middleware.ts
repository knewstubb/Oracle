import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { attemptLocalAutoLogin, getLocalAutoLoginCredentials } from '@/lib/local-auto-login'

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/api/cards/search', '/api/cards/autocomplete']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Local-only opt-in auto sign-in (null unless dev + both env vars set)
  const autoLogin = getLocalAutoLoginCredentials()

  // Allow public routes to pass through without auth check
  if (!(autoLogin && pathname.startsWith('/login')) && PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Create Supabase client with cookie read/write access via request/response
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — calling getUser() triggers token refresh and validates session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let signedIn = !!user
  if (!user && autoLogin) {
    signedIn = await attemptLocalAutoLogin(supabase, autoLogin)
  }

  if (!signedIn) {
    // Auto sign-in failed on /login: show the normal login screen
    if (pathname.startsWith('/login')) return NextResponse.next()

    // API routes should return 401 instead of redirecting to an HTML page
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Page routes redirect to login
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (autoLogin && pathname.startsWith('/login')) {
    const redirect = NextResponse.redirect(new URL('/', request.url))
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
