import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Playwright / cloud-agent browsers hitting 127.0.0.1 (not localhost)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
