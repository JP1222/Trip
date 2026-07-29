import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller production image for Docker
  output: "standalone",
  // Native image tooling — keep out of the server bundle
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode"],
  // Mapbox ships modern ESM/CJS mix
  transpilePackages: ["mapbox-gl"],
  // Allow larger photo + video uploads via App Router / proxy
  experimental: {
    serverActions: {
      bodySizeLimit: "110mb",
    },
    // Route Handler body (formData uploads); default is 10mb
    proxyClientMaxBodySize: "110mb",
  },
};

export default nextConfig;
