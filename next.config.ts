import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e server (npm run dev:test) builds into .next-e2e, so it never shares output with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
