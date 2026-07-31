import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the root so Next stops inferring it from lockfiles further up the tree.
  outputFileTracingRoot: __dirname,
  // Ad creatives are uploaded as base64 for Claude vision — raise the body cap.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
