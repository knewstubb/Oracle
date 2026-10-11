import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type checking is enabled during `next build`. The five files deferred by T-42
  // carry a `// @ts-nocheck` header until their phases resume; see
  // docs/oracle/reports/2026-10-11-developer-t42-t43-checks-gate.md.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '0.1.0',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cards.scryfall.io',
      },
      {
        protocol: 'https',
        hostname: 'api.scryfall.com',
      },
      {
        protocol: 'https',
        hostname: 'svgs.scryfall.io',
      },
    ],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
  redirects: async () => [
    {
      source: '/shared-cards',
      destination: '/allocation',
      permanent: true,
    },
  ],
};

export default nextConfig;
