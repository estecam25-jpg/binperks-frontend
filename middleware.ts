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
import { PWA_APPS, appForPath, pwaAppForHost, MEMBER_APP_ORIGIN, type PwaAppId } from '@/lib/pwa-manifest'
import { storeKeyFromPath } from '@/lib/stamp-store-url'

/**
 * The hostname the browser actually asked for.
 *
 * NOT request.nextUrl.hostname: Next rebuilds request.url from the address the
 * server is listening on, so nextUrl reads "localhost" even for a request to
 * stamptool.localhost:3000 — confirmed in dev, where host-based routing on
 * nextUrl silently never matched. x-forwarded-host first, for when a proxy in
 * front rewrites Host.
 */
function hostnameOf(request: NextRequest): string {
  const rawHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  return rawHost.split(',')[0].trim().split(':')[0].toLowerCase()
}

/**
 * Where a section lives, as an origin.
 *
 * Production origins come from the registry. On *.localhost the equivalent dev
 * host is used instead, with the same port, so a wrong-subdomain hit in dev
 * lands on the dev server rather than bouncing someone to production.
 */
function originFor(target: PwaAppId | 'member', request: NextRequest, hostname: string): string {
  const production = target === 'member' ? MEMBER_APP_ORIGIN : PWA_APPS[target].origin

  if (hostname !== 'localhost' && !hostname.endsWith('.localhost')) return production

  const port = request.nextUrl.port ? `:${request.nextUrl.port}` : ''
  if (target === 'member') return `http://localhost${port}`

  // Each subdomain app lists its dev host alongside its production one.
  const devHost = [...PWA_APPS[target].hosts].find(h => h.endsWith('.localhost'))
  return devHost ? `http://${devHost}${port}` : production
}

/**
 * Send a path to the host that owns it.
 *
 * The subdomains each serve the whole app, so admin.binperks.com/member/home
 * renders the member app on the admin origin — with its own cookie jar, so the
 * member is signed out there, and its own manifest, so installing from it would
 * add the wrong icon. Sessions being per-origin is what makes this worth
 * redirecting rather than leaving alone.
 *
 *   stamptool.  /member/* → app.binperks.com   /merchant/* → merchant.   /admin/* → admin.
 *   merchant.   /member/* → app.binperks.com   /admin/*    → admin.      /stamptool/* → stamptool.
 *   admin.      /member/* → app.binperks.com   /merchant/* → merchant.   /stamptool/* → stamptool.
 *
 * ONLY FROM THE SUBDOMAIN APPS. app.binperks.com keeps serving every section
 * itself: /merchant/signup is the public funnel that marketing links to, and
 * /stamptool is the cashier tool's original home. Redirecting those would break
 * printed materials and bookmarks for no gain.
 *
 * Path and query are carried over, so a deep link still lands where it meant
 * to. 307, not 308 — nothing here is a permanent URL change.
 */
function wrongSubdomainRedirect(request: NextRequest, hostname: string): URL | null {
  const currentApp = pwaAppForHost(hostname)
  if (!currentApp) return null

  const owner = appForPath(request.nextUrl.pathname)
  if (!owner || owner === currentApp.id) return null

  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, originFor(owner, request, hostname))
  return url
}

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
 * And on stamptool. only, one more:
 *
 *   /<storeKey>            → /stamptool/<storeKey>   a store's own printable,
 *                                                    bookmarkable URL, e.g.
 *                                                    /FL-LakeWales-BinChasersLakeWales
 *
 *   Matched by SHAPE (lib/stamp-store-url), not "any single segment": the
 *   subdomain still serves /terms, /api, the manifest and so on, and those must
 *   not become "Store not found". Store keys start with a capitalised state
 *   code; every app route is lowercase.
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
function subdomainRewrite(request: NextRequest, hostname: string): URL | null {
  const app = pwaAppForHost(hostname)
  if (!app) return null

  const { pathname } = request.nextUrl
  const storeKey = app.id === 'cashier' ? storeKeyFromPath(pathname) : null

  const target =
    pathname === '/'                     ? app.homePath :
    pathname === '/manifest.webmanifest' ? app.manifestPath :
    storeKey                             ? `/stamptool/${storeKey}` :
    null
  if (!target) return null

  const url = request.nextUrl.clone()   // keeps the query string
  url.pathname = target
  return url
}

export async function middleware(request: NextRequest) {
  const hostname = hostnameOf(request)

  // Wrong host for this path — bounce before doing anything else. Nothing is
  // rendered and no cookie is refreshed on a response the browser discards.
  const redirectTo = wrongSubdomainRedirect(request, hostname)
  if (redirectTo) return NextResponse.redirect(redirectTo, 307)

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
  const rewriteTo = subdomainRewrite(request, hostname)
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
