/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['lucide-react'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*',
      },
      {
        source: '/ws',
        destination: 'http://127.0.0.1:3001/ws',
      },
    ];
  },
};

module.exports = nextConfig;
