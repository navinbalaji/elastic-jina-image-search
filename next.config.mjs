/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@elastic/elasticsearch'],
  },
};

export default nextConfig;
