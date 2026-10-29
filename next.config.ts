import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every page reads live data from the database, so the Cache Components
  // prerendering model doesn't fit; pages render per request instead.
  cacheComponents: false,
  reactCompiler: true,
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    // Receipt photos are resized on the phone, but PDFs come through as-is.
    serverActions: { bodySizeLimit: '10mb' },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
