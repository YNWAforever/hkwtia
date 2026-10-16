import path from "node:path";

import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "tests/integration/**/*.{test,spec}.{ts,tsx}"],
    /**
     * Headroom over the 5000ms default, which the heavy page renders outgrew.
     *
     * `homepage`, `wt-pages/about`, `wt-pages/launchpad-page`,
     * `public-environment-isolation` and `repository-boundary` each finish in
     * under 1.2s alone, but a full `npm test` run on a loaded machine pushed
     * all five past 5s at once — and the homepage's `en` case timed out
     * mid-render, so its DOM survived into the `zh-HK` case, which then saw 26
     * sections instead of 13. One timeout produced two red tests and neither
     * named a real defect. CI shards two ways for the same reason (see
     * `.github/workflows/ci.yml`), which lowers the odds without removing them.
     *
     * A genuinely hung test still fails here; it just takes 20s to say so.
     * Raise this only with evidence, never to quiet a test that has begun to
     * hang for a reason.
     */
    testTimeout: 20_000,
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
