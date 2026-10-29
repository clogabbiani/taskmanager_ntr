import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // Webpack's persistent cache logs "Serializing big strings" on cold builds.
    // It is a cache-performance hint about webpack internals, not about our code;
    // keep only real infrastructure errors so the build output stays warning-free.
    config.infrastructureLogging = { ...config.infrastructureLogging, level: "error" };
    return config;
  },
};

export default nextConfig;
