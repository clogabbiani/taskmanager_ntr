import react from "@vitejs/plugin-react";

import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
