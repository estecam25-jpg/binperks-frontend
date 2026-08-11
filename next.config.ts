import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      {
        source: '/join/:storeKey',
        destination: '/member/join/:storeKey',
        permanent: false,
      },

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
    ]
  },
};

export default nextConfig;
