/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server for the Docker image; `npm start` keeps using the regular build
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  experimental: {
    serverComponentsExternalPackages: ['@elastic/elasticsearch'],
  },
};

export default nextConfig;
