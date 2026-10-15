import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // standalone output keeps `next start` deployable on Render/Docker/VPS.
  // Vercel ignores this and uses its own optimized runtime.
  output: 'standalone',
  async rewrites() {
    // home and "how it works" are app pages now, with the same bars and footer as every other page
    return { beforeFiles: [], afterFiles: [], fallback: [] };
  },
};

export default nextConfig;
