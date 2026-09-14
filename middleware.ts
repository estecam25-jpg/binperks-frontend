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
import { pwaAppForHost } from '@/lib/pwa-manifest'

/**
 * Subdomain apps — stamptool., merchant. and admin.binperks.com — each served
 * as its own installable PWA. The host table lives in lib/pwa-manifest
 * (PWA_APPS); this function only applies it.
 *
 * Only TWO paths are rewritten on those hosts; everything else is served as-is:
 *
 *   /                      → the app's home          stamptool.  → /stamptool
 *                                                    merchant.   → /merchant/dashboard
 *                                                    admin.      → /admin/dashboard
 *   /manifest.webmanifest  → the app's manifest      so it installs under its
 *                                                    own name, not as the member app
 *
 * Deliberately not a blanket path prefix. Each app's pages navigate with
 * absolute paths (/stamptool/lookup, /merchant/login, /admin/dashboard) and call
 * /api/..., and static assets live at the root — prefixing every path would
 * break all of them. Leaving those alone means the existing pages work on the
 * subdomains untouched, including sign-in: the login routes set their session
 * cookie on whichever host made the request, and every redirect in those flows
 * is a relative path.
 *
 * On merchant. and admin., `/` reaches the dashboard's own session gate, which
 * sends a signed-out user to the login page. The merchant gate builds ?return=
 * from x-binperks-path, which is the ORIGINAL path — "/" — so after signing in
 * the merchant comes back to "/" and this rewrite shows the dashboard again.
 *
 * Returns null for every other host, so app.binperks.com is unaffected.
 */
function subdomainRewrite(request: NextRequest): URL | null {
  // From the Host header, NOT request.nextUrl.hostname. Next rebuilds
  // request.url from the address the server is listening on, so nextUrl reads
  // "localhost" even for a request to stamptool.localhost:3000 — confirmed in
  // dev, where host-based routing on nextUrl silently never matched. The
  // header is what the browser actually asked for. x-forwarded-host first, for
  // when a proxy in front rewrites Host.
  const rawHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  const hostname = rawHost.split(',')[0].trim().split(':')[0].toLowerCase()

  const app = pwaAppForHost(hostname)
  if (!app) return null

  const target =
    request.nextUrl.pathname === '/'                     ? app.homePath :
    request.nextUrl.pathname === '/manifest.webmanifest' ? app.manifestPath :
    null
  if (!target) return null

  const url = request.nextUrl.clone()   // keeps the query string
  url.pathname = target
  return url
}

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

  // Every response below is built by this one function, so the subdomain
  // rewrite survives the cookie refresh in setAll() — which replaces the
  // response object and would otherwise silently drop back to next().
  const rewriteTo = subdomainRewrite(request)
  const continueRequest = () => rewriteTo
    ? NextResponse.rewrite(rewriteTo, { request: { headers: forwardedHeaders } })
    : NextResponse.next({ request: { headers: forwardedHeaders } })

  let supabaseResponse = continueRequest()

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
          supabaseResponse = continueRequest()
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
