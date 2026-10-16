import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: { root: process.cwd() },
  images: { unoptimized: true },
  poweredByHeader: false,
  devIndicators: false,
};
export default config;
