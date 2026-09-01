import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Git ignores this, but flat config keeps its own list — without the entry
    // `npm run lint` walks into a worktree and lints a second copy of the repo.
    ".worktrees/**",
    // Same reason: a stale Vite `dist/` build at the repo root is git-ignored but
    // not eslint-ignored, and its 500 KB bundle makes the stylish formatter throw
    // `RangeError: Invalid string length` instead of reporting anything.
    "dist/**",
  ]),
  {
    files: ["lib/**/*.{ts,tsx}"],
    ignores: ["lib/db/repos/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {name: "@/lib/db/client", message: "Database access belongs in lib/db/repos."},
          {name: "@/lib/db/repos/common", message: "Repository helpers belong in lib/db/repos."},
        ],
      }],
    },
  },
]);
