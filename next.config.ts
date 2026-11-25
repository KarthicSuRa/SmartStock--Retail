import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strict mode catches extra renders in dev; production parity.
  reactStrictMode: true,
  // Do not ship browser source maps by default — transfers bytes, rarely used.
  productionBrowserSourceMaps: false,
  // Tree-shakes package exports, reduces JS bytes sent to the browser.
  experimental: {
    optimizePackageImports: true,
  },
  // Keep parallel rendering off for now; it can add serialization latency.
  // parallelRoutes: true,
}

export default nextConfig
