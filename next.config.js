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
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },

  // Disable x-powered-by header for security
  poweredByHeader: false,
};

module.exports = nextConfig;
