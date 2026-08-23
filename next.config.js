// next.config.js — SmartStock LiveRetail Next.js configuration

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone bundle for Netlify/Docker deployment
  output: 'standalone',

  // Allow images from Supabase storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  // Resolve @/ path alias to src/
  // (next.config.js enforces this for non-TS tooling too)
  experimental: {
    // Enable server actions for future form handling
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },

  // Disable x-powered-by header for security
  poweredByHeader: false,

  // Redirect root to /login so the app has a proper entry point
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
