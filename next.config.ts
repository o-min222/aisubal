import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Playwright / cloud-agent browsers hitting 127.0.0.1 (not localhost)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 0006: 툴박스 + 프로덕트 → 툴. /products/[id] needs a DB lookup (app/(app)/products/[id]).
  async redirects() {
    return [
      { source: "/toolbox", destination: "/tools", permanent: true },
      { source: "/toolbox/new", destination: "/tools/new", permanent: true },
      { source: "/toolbox/:slug", destination: "/tools/:slug", permanent: true },
      { source: "/products/new", destination: "/tools/launch", permanent: true },
      // 밋업 → 모임
      { source: "/meetups", destination: "/moim", permanent: true },
      { source: "/meetups/new", destination: "/moim/new", permanent: true },
      { source: "/meetups/:id", destination: "/moim/:id", permanent: true },
    ];
  },
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
