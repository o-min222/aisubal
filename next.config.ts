import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-headers";
import { STATIC_ASSET_CACHE_HEADERS } from "./src/lib/static-cache-headers";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

const nextConfig: NextConfig = {
  // Allow Playwright / cloud-agent browsers hitting 127.0.0.1 (not localhost)
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  // AI-8: Next's blocking-metadata bot list + KakaoTalk's scraper (it reads og tags from <head> only)
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|kakaotalk-scrap|TelegramBot`, "i"),
  // A67: back/forward and tab hops within 30 s reuse the client router cache (per browser, so per user)
  // instead of re-rendering on the server. Mutations call router.refresh()/revalidatePath, which clear it.
  experimental: {
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }, ...STATIC_ASSET_CACHE_HEADERS];
  },
  // 0006: 툴박스 + 프로덕트 → 툴. /products/[id] needs a DB lookup (app/(app)/products/[id]).
  async redirects() {
    return [
      { source: "/toolbox", destination: "/gallery", permanent: true },
      { source: "/toolbox/new", destination: "/gallery/new", permanent: true },
      { source: "/toolbox/:slug", destination: "/gallery/:slug", permanent: true },
      { source: "/products/new", destination: "/gallery/new", permanent: true },
      { source: "/gallery/launch", destination: "/gallery/new", permanent: true }, // A87: one place to post
      // 툴 → 갤러리 (308, keeps old links and agent-shared URLs working)
      { source: "/tools", destination: "/gallery", permanent: true },
      { source: "/tools/:path*", destination: "/gallery/:path*", permanent: true },
      // 밋업 → 모임
      { source: "/meetups", destination: "/moim", permanent: true },
      { source: "/meetups/new", destination: "/moim/new", permanent: true },
      { source: "/meetups/:id", destination: "/moim/:id", permanent: true },
      // 네트워크 → 내 대시보드 › 네트워크 (query like ?root= is carried over)
      { source: "/network", destination: "/me?tab=network", permanent: true },
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
