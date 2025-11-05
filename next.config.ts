import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Use standalone output for minimal Docker production builds
  output: "standalone",
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: false, // Enable PWA in all environments
  buildExcludes: [/middleware-manifest\.json$/],
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
})(nextConfig);
