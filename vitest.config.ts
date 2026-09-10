import path from "node:path";

import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // A timeout is a liveness bound, not an assertion, and 5000ms is not one
    // on a loaded machine. Two whole-page renders (tests/unit/homepage.test.tsx
    // and tests/unit/wt-pages/launchpad-page.test.tsx) take ~1.1s alone and
    // have been observed crossing 5s under an 11-worker jsdom run, which is
    // worse than a plain failure: a timed-out test's `render()` still resolves
    // *after* Testing Library's afterEach cleanup has run, so it mounts into
    // the next test's DOM and that test fails on duplicated nodes instead —
    // 13 landmarks read as 26, one eyebrow reads as two. The reported failure
    // is then two files away from the cause. Since 0e5a725 a red shard fails
    // the quality gate, so this flake costs a whole CI run. Raising the bound
    // hides no assertion: a test that genuinely hangs still fails, later.
    testTimeout: 20_000,
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
