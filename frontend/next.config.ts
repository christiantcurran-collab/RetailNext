import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/occasion", destination: "/" },
      { source: "/style", destination: "/" },
      { source: "/processing", destination: "/" },
      { source: "/results", destination: "/" },
    ];
  },
};

export default nextConfig;
