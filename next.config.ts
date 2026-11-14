import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e server (npm run dev:test) builds into .next-e2e, so it never shares output with `npm run dev`; a
  // production build next to a running dev server uses NEXT_DIST_DIR=.next-build (README, Production build).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
