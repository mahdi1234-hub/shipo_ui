import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@/cosmograph/style.module.css": "@cosmograph/cosmograph/cosmograph/style.module.css",
    },
  },
};

export default nextConfig;
