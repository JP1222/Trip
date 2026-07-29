import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native image tooling — keep out of the server bundle
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode"],
  // Allow larger photo uploads via App Router
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
