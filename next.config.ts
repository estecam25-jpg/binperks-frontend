import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The bundled font has to reach the serverless function.
   *
   * public/ is uploaded as static CDN assets, which does NOT put it on the
   * function's filesystem — and the marketing renderer reads the TTF off disk
   * (lib/marketing-render). Tracing is by route glob; without this the route
   * deploys and then throws ENOENT the first time a merchant downloads a JPG.
   */
  outputFileTracingIncludes: {
    '/api/merchant/marketing/[material]': ['./public/fonts/**'],
  },

  async redirects() {
    return [
      // Redirect old /join/[storeKey]/* to /member/join/[storeKey]/*
      // Preserves backwards compatibility for QR codes and stored referral URLs.
      // Using temporary (307) in case the structure changes again.
      {
        source: '/join/:storeKey/signup',
        destination: '/member/join/:storeKey/signup',
        permanent: false,
      },
      {
        source: '/join/:storeKey/vip',
        destination: '/member/join/:storeKey/vip',
        permanent: false,
      },
      {
        source: '/join/:storeKey/thankyou',
        destination: '/member/join/:storeKey/thankyou',
        permanent: false,
      },
      // QR codes that name how they were reached:
      //   /join/FL-Tampa-EstaBins/in-store_at-the_register
      // The source is the last segment and /member/join/[storeKey]/[source]
      // resolves it — see lib/join-source. Signing up through the register QR
      // awards that day's visit stamp, so these URLs are printed on a sticker
      // at a counter and have to keep resolving for as long as the sticker is
      // there.
      //
      // ORDER MATTERS: this comes AFTER the three rules above, which is what
      // keeps '/join/:storeKey/signup' going to the funnel step rather than
      // being read as a source named "signup". Next takes the first rule that
      // matches.
      {
        source: '/join/:storeKey/:source',
        destination: '/member/join/:storeKey/:source',
        permanent: false,
      },

      // NOTE: there is deliberately NO bare '/join/:storeKey' rule here.
      // /join/XXXXXX is now the short member referral link, and a redirect at
      // this level fired before the route could ever run — every short code
      // bounced to /member/join/XXXXXX and 404'd. app/join/[code] handles both:
      // a 6-character referral code resolves the referrer, and anything else is
      // treated as a store key and forwarded to /member/join/[storeKey], so old
      // QR links keep working. The sub-path rules below still apply.

      // The stamp tool moved from /stamp to /stamptool. Cashiers have the old
      // URL bookmarked on store tablets and it is printed on materials, so both
      // the sub-pages and the bare route have to keep working.
      //
      // Order matters: the catch-all must come AFTER the bare route, or
      // '/stamp' would match ':path*' as an empty segment and redirect to
      // '/stamptool/'. Temporary (307) to match the /join redirects above —
      // nothing here should be cached permanently by a browser yet.
      {
        source: '/stamp',
        destination: '/stamptool',
        permanent: false,
      },
      {
        source: '/stamp/:path*',
        destination: '/stamptool/:path*',
        permanent: false,
      },

      // Phase 1 member redesign moved the dashboard into a 5-tab layout.
      // /member/dashboard is baked into a lot of places that are NOT safe to
      // rewrite — the magic-link redirectTo in lib/member-otp, /auth/callback,
      // /api/member/verify-code — so the old URL has to keep resolving rather
      // than those flows being edited.
      {
        source: '/member/dashboard',
        destination: '/member/home',
        permanent: false,
      },
      {
        source: '/member/settings',
        destination: '/member/account',
        permanent: false,
      },

      // The fifth tab was briefly /member/beyond before being renamed MORE.
      // Short-lived, but the URL is cheap to keep resolving.
      {
        source: '/member/beyond',
        destination: '/member/more',
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
