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
    ]
  },
};

export default nextConfig;
