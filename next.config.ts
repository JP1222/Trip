import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller production image for Docker
  output: "standalone",
  // Native image tooling — keep out of the server bundle
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode"],
  // Mapbox ships modern ESM/CJS mix
  transpilePackages: ["mapbox-gl"],
  // Allow larger photo uploads via App Router
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
