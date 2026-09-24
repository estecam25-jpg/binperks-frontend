/**
 * The browser-side Supabase client.
 *
 * SESSIONS LIVE IN COOKIES, NOT localStorage — and must stay there.
 *
 * createBrowserClient from @supabase/ssr keeps the session in cookies on
 * purpose: the server has to read it too. Every API route, every server
 * component and middleware.ts authenticate by reading the sb-* cookies that
 * this client and the sign-in routes write. Sessions in localStorage are
 * invisible to the server, so switching storage would 401 every API call and
 * sign every member out on their next page load.
 *
 * NOTHING HERE USES sessionStorage. The app's sessionStorage entries are
 * signup-funnel state (lib/signup-session, lib/merchant-signup-session,
 * lib/stamp-session) and hold no credentials.
 *
 * HOW LONG A SIGN-IN LASTS. The cookies are written with a max-age of 400
 * days — @supabase/ssr's own default, which it applies to every session cookie
 * it writes and which is the longest a browser will honour. The server side is
 * governed by the Supabase project's Auth settings, not by this file: sessions
 * there are not time-boxed and have no inactivity timeout, so a session lasts
 * as long as it keeps being refreshed. Confirmed against auth.sessions on
 * 2026-09-24 — no row has not_after set, and the longest-lived session at that
 * point had been alive and refreshing for 50 days.
 *
 * Token refresh happens in middleware.ts, server-side, so the refreshed
 * cookies arrive in a Set-Cookie header rather than being written by script —
 * which matters on iOS, where Safari caps script-written cookies at 7 days and
 * PWAs inherit that cap. This client is only ever built for signOut.
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}