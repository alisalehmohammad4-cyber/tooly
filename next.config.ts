import type { NextConfig } from "next";

const BUILD_ID = `v2.3.0-${Date.now()}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: BUILD_ID,
  },
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, must-revalidate',
        },
        {
          key: 'Pragma',
          value: 'no-cache',
        },
        {
          key: 'Expires',
          value: '0',
        },
        {
          key: 'X-Tooly-Version',
          value: BUILD_ID,
        },
      ],
    },
  ],
};

export default nextConfig;
