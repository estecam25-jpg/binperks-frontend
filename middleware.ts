/**
 * Supabase SSR session refresh middleware.
 *
 * Required by @supabase/ssr — without this, access tokens expire after ~1 hour
 * and supabase.auth.getUser() silently returns null, causing every authenticated
 * API route to return 401 Unauthorized.
 *
 * This middleware runs on every non-static request, reads the sb-* session
 * cookies, and refreshes the access token if needed before passing the request
 * to the route handler.
 *
 * See: https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // The current URL, passed forward as a header.
  //
  // A server layout cannot see the request URL, and the merchant dashboard
  // gate needs it to build ?return= so an expired session comes back to the
  // exact tab and location the merchant was on. Set explicitly rather than
  // relying on Next's internal x-invoke-* headers, which are not part of the
  // public API and have changed between versions.
  // Built as a new Headers object and passed through `request.headers` on every
  // NextResponse.next() below. Mutating request.headers alone is not enough —
  // the values only reach a server component when they are handed to
  // NextResponse.next({ request: { headers } }).
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.set('x-binperks-path', request.nextUrl.pathname)
  forwardedHeaders.set('x-binperks-query', request.nextUrl.search)

  let supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write updated cookies to both the request (for downstream route handlers)
          // and the response (so the browser receives the refreshed token).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request: { headers: forwardedHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not add any logic between createServerClient and getUser().
  // getUser() triggers a token refresh when the access token is expired.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    /**
     * All routes except Next internals and static assets.
     *
     * THE `.*` AFTER THE LOOKAHEAD IS LOAD-BEARING. It previously read
     * `$.*))`, which closed the group around a zero-width lookahead and made
     * this match the literal path "/" and nothing else — the middleware ran on
     * the home page alone. Every other route, including every API route and
     * all three dashboards, went without the Supabase token refresh this file
     * exists to perform: exactly the "sessions expire after ~1 hour and
     * getUser() silently returns null" failure described at the top.
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
