import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only Next.js badge sat on top of the sidebar footer; production never shows it anyway.
  devIndicators: false,
  // NOTE: cacheComponents / partialPrefetching (scaffold default) are disabled on purpose:
  // every page here is per-user and dynamic (cookie-based current user), so we keep the
  // classic dynamic rendering model. See docs/DECISIONS.md.
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
