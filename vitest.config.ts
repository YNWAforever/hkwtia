import path from "node:path";

import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "tests/integration/**/*.{test,spec}.{ts,tsx}"],
    // Vitest externalizes node_modules deps by default, resolving their
    // internal imports via plain Node rather than Vite. Node's classic
    // resolver won't follow the extensionless `next/navigation` that
    // next-intl's `createNavigation` (imported by @/i18n/navigation's Link)
    // uses internally, because Next ships no "exports" map for it. Inlining
    // routes next-intl through Vite's own resolver, which follows it fine.
    server: {deps: {inline: [/next-intl/]}},
  },
  resolve: {
    alias: {"@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/server-only.ts"), "next/headers": path.resolve(__dirname, "node_modules/next/headers.js"), "@neondatabase/auth/next/server": path.resolve(__dirname, "tests/neon-auth-server.ts")},
  },
});
