import type { NextConfig } from "next";

// In production, Caddy reverse-proxies /api/* to the API container under the
// same origin (see deployment/Caddyfile), so no rewrite is needed there. In
// local dev, the API runs on a different port; this rewrite makes it
// same-origin from the browser's point of view too, so cookies/CSRF/SSE all
// behave identically in dev and prod without any CORS configuration.
const apiOrigin = process.env.API_PROXY_ORIGIN;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
