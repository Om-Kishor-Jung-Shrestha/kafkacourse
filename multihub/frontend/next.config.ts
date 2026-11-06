import type { NextConfig } from 'next';

// API_GATEWAY_URL is a server-side-only env var (no NEXT_PUBLIC_ prefix, so
// it's never sent to the browser bundle) pointing at Kong — the backend's
// API gateway (infra/kong/) — not at the backend container directly.
// Frontend serving and the API gateway are two separate, distinct roles in
// this stack (frontend-nginx vs. Kong); this rewrite keeps that boundary
// intact for server-side requests too, not just client-side ones (see
// NEXT_PUBLIC_API_URL for the client-side path, which also targets Kong).
// It also means API calls work correctly even when the app is opened at
// :3000 directly (bypassing frontend-nginx), not just through
// http://localhost/.
const API_GATEWAY_URL = process.env.API_GATEWAY_URL ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_GATEWAY_URL}/api/:path*` }];
  },
};

export default nextConfig;
