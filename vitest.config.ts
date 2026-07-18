import path from "node:path";

import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "tests/integration/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {"@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/server-only.ts"), "next/headers": path.resolve(__dirname, "node_modules/next/headers.js"), "@neondatabase/auth/next/server": path.resolve(__dirname, "tests/neon-auth-server.ts")},
  },
});
