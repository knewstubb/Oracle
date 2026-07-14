import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
    ],
  },
  redirects: async () => [
    {
      source: '/shared-cards',
      destination: '/allocation',
      permanent: true,
    },
  ],
};

export default nextConfig;
